#import "AppUtils.h"

#include <sys/types.h>
#include <sys/sysctl.h>

#import <Foundation/Foundation.h>

#import <AudioToolbox/AudioToolbox.h>
#import <AudioToolbox/AudioServices.h>

#import <React/RCTReloadCommand.h>
#import <React/RCTImageLoader.h>
#import <React/RCTConvert.h>

#import <RNFBMessaging/RNFBMessaging+UNUserNotificationCenter.h>

@import UIKit;
@import Darwin.sys.sysctl;


@implementation AppUtilsModule
{
  bool hasListeners;
}

RCT_EXPORT_MODULE();

// Use React Native's image loader/cache; never fetch or decode on the UI thread.
// A fixed 32x32 sRGB ARGB sample keeps bridge work small and platform-independent.
RCT_EXPORT_METHOD(getImageSample:(NSString *)uri
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSURLRequest *request = [RCTConvert NSURLRequest:uri];
  RCTImageLoader *loader = [self.bridge moduleForClass:RCTImageLoader.class];
  if (!request || !loader) { resolve(@[]); return; }
  NSObject *lock = [NSObject new];
  __block BOOL finished = NO;
  RCTImageLoaderCancellationBlock cancel = [loader loadImageWithURLRequest:request
      size:CGSizeMake(32, 32) scale:1 clipped:YES resizeMode:RCTResizeModeStretch
      progressBlock:nil partialLoadBlock:nil completionBlock:^(NSError *error, UIImage *image) {
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
      @autoreleasepool {
        NSMutableArray *sample = [NSMutableArray arrayWithCapacity:1024];
        if (!error && image.CGImage) {
          uint8_t bytes[32 * 32 * 4] = {0};
          CGColorSpaceRef space = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
          CGContextRef context = CGBitmapContextCreate(bytes, 32, 32, 8, 32 * 4, space,
              kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
          CGColorSpaceRelease(space);
          if (context) {
            CGContextDrawImage(context, CGRectMake(0, 0, 32, 32), image.CGImage);
            CGContextRelease(context);
            for (NSUInteger i = 0; i < sizeof(bytes); i += 4) {
              uint32_t alpha = bytes[i + 3];
              uint32_t red = alpha ? MIN(255, (bytes[i] * 255 + alpha / 2) / alpha) : 0;
              uint32_t green = alpha ? MIN(255, (bytes[i + 1] * 255 + alpha / 2) / alpha) : 0;
              uint32_t blue = alpha ? MIN(255, (bytes[i + 2] * 255 + alpha / 2) / alpha) : 0;
              [sample addObject:@((alpha << 24) | (red << 16) | (green << 8) | blue)];
            }
          }
        }
        @synchronized(lock) { if (finished) return; finished = YES; }
        resolve(sample);
      }
    });
  }];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 8 * NSEC_PER_SEC),
      dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    @synchronized(lock) { if (finished) return; finished = YES; }
    if (cancel) cancel();
    resolve(@[]);
  });
}


- (NSArray<NSString *> *)supportedEvents
{
  return @[@"Utils.timeout"];;
}

- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}


+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

// Will be called when this module's first listener is added.
-(void)startObserving {
  hasListeners = YES;
}

// Will be called when this module's last listener is removed, or on dealloc.
-(void)stopObserving {
  hasListeners = NO;
}


- (NSDictionary *)constantsToExport {
  return @{
    @"appVersion": [self getAppVersion],
    @"buildNumber": [self getBuildNumber],
    @"isDebug": @(self.isDebug),
    @"isTestFlight": @(self.isTestFlight),
  };
}

- (NSString *) getAppVersion {
  return [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleShortVersionString"];
}

- (NSString *) getBuildNumber {
  return [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleVersion"];
}

- (BOOL) isDebug {
  #if DEBUG
    return YES;
  #else
    return NO;
  #endif
}

// TestFlight installs use a sandbox App Store receipt. App Store installs do not.
- (BOOL) isTestFlight {
  NSURL *receiptURL = [[NSBundle mainBundle] appStoreReceiptURL];
  return [receiptURL.lastPathComponent isEqualToString:@"sandboxReceipt"];
}

RCT_EXPORT_METHOD(restartBundle) {
  if ([NSThread isMainThread]) {
    // clear initialNotification from RNF messaging
    [RNFBMessagingUNUserNotificationCenter sharedInstance].initialNotification = nil;
    RCTTriggerReloadCommandListeners(@"Manual restartBundle");
  } else {
    dispatch_sync(dispatch_get_main_queue(), ^{
      [RNFBMessagingUNUserNotificationCenter sharedInstance].initialNotification = nil;
      RCTTriggerReloadCommandListeners(@"Manual restartBundle");
    });
  }
  return;
}

RCT_EXPORT_METHOD(exitApp)
{
  exit(0);
}


RCT_EXPORT_METHOD(timeoutEvent:(NSString *)timeoutId timeout:(int)timeout
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  __block UIBackgroundTaskIdentifier task = [[UIApplication sharedApplication] beginBackgroundTaskWithName:@"AppUtilsModule" expirationHandler:^{
    [[UIApplication sharedApplication] endBackgroundTask:task];
  }];
  
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, timeout * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
    if ([self bridge] != nil && self->hasListeners) {
      [self sendEventWithName:@"Utils.timeout" body:timeoutId];
    }
    
    [[UIApplication sharedApplication] endBackgroundTask:task];
  });
  resolve([NSNumber numberWithBool:YES]);
}

@end
