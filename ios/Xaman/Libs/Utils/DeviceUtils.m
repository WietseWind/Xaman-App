#import "DeviceUtils.h"

#include <sys/types.h>
#include <sys/sysctl.h>
#import <sys/utsname.h>

#import <Foundation/Foundation.h>

@import UIKit;

#import <React/RCTView.h>
#import <React/RCTViewManager.h>
#import <React/RCTComponent.h>

// The edge on which iOS puts a vertical bar (the tab bar) for these traits: 0 none, 1 leading, 2 trailing.
// Only a phone that has such a bar gives another value than 0 (iPhone Duo, iOS 27.1 and later). Read by name, so
// this builds with every SDK.
static NSInteger XamanVerticalBarEdge(UITraitCollection *traits)
{
  SEL selector = NSSelectorFromString(@"verticalBarEdge");
  if (traits == nil || ![traits respondsToSelector:selector]) {
    return 0;
  }
  @try {
    NSInteger edge = [[traits valueForKey:@"verticalBarEdge"] integerValue];
    return (edge == 1 || edge == 2) ? edge : 0;
  } @catch (NSException *exception) {
    return 0;
  }
}

// The last edge that was seen for this process: it outlives a reload of the JavaScript side.
static NSInteger verticalBarEdgeSeen = 0;

@implementation DeviceUtilsModule

RCT_EXPORT_MODULE();

- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (NSDictionary *)constantsToExport {
  return @{
    @"osVersion": [self getOSVersion],
    @"brand": @"Apple",
    @"model": [self getModel],
    @"layoutInsets": [self getLayoutInsets],
    @"verticalBarEdge": @([self getVerticalBarEdge]),
    @"isPadDevice": @([DeviceUtilsModule isPadDevice]),
    @"padLayout": [self getPadLayout],
    @"tabBarMetrics": [self getTabBarMetrics],
  };
}

// The app on an iPad (issue 553). The app is an iPhone app; an iPad runs it in a window of the system.
// - iPadOS 27: the window is a real window. The user can make it larger and smaller, and the app gets the real
//   screen of the iPad. The app then keeps one phone layout, in a box (src/common/helpers/sideSafeArea.tsx), and
//   asks the system to keep the window at that size (SceneDelegate.m).
// - older iPadOS: the app gets the screen of a phone, and the system scales that. Nothing is different from a
//   phone there, so no layout size is told.
+ (BOOL)isPadDevice
{
  static BOOL isPad = NO;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    // The model, not the interface idiom: the idiom of an iPhone app is "phone" on an iPad too.
    // Not a Mac that runs the iOS app: it also tells "iPad" as its model, and it was not looked at for this.
    isPad = [[UIDevice currentDevice].model hasPrefix:@"iPad"] && !NSProcessInfo.processInfo.isiOSAppOnMac;
  });
  return isPad;
}

// A screen with a short side of less than this is the screen of a phone (the largest iPhone is 440 pt wide, the
// smallest iPad 744 pt).
static const CGFloat XamanPadShortSideMin = 600.0;

+ (CGSize)padLayoutSize
{
  if (![DeviceUtilsModule isPadDevice]) {
    return CGSizeZero;
  }
  CGSize screen = UIScreen.mainScreen.bounds.size;
  CGFloat shortSide = MIN(screen.width, screen.height);
  if (shortSide < XamanPadShortSideMin) {
    return CGSizeZero;
  }
  // The height has to fit on the screen in landscape too, so it is not more than the short side of the screen.
  // The sizes are those of iPhones: 430 x 932 (Pro Max), 390 x 844, and 375 wide for a lower screen.
  CGFloat height = MIN(932.0, floor(shortSide));
  CGFloat width = height >= 932.0 ? 430.0 : (height >= 844.0 ? 390.0 : 375.0);
  return CGSizeMake(width, height);
}

// {width: 0, height: 0} when the app has no layout size of its own (every iPhone).
- (NSDictionary *) getPadLayout
{
  CGSize size = [DeviceUtilsModule padLayoutSize];
  return @{ @"width": @(size.width), @"height": @(size.height) };
}

- (NSString *) getOSVersion {
  UIDevice *currentDevice = [UIDevice currentDevice];
  return currentDevice.systemVersion;
}

- (NSString *) getModel {
  struct utsname systemInfo;
  uname(&systemInfo);
  NSString* deviceId = [NSString stringWithCString:systemInfo.machine
                                          encoding:NSUTF8StringEncoding];
  #if TARGET_IPHONE_SIMULATOR
    deviceId = [NSString stringWithFormat:@"%s", getenv("SIMULATOR_MODEL_IDENTIFIER")];
  #endif
  
  return deviceId;
}

// The safe area of the window as it was the last time it had one on a side (iPhone Duo). Process wide: it outlives
// a reload of the JavaScript side, where this module is made again.
static BOOL sideSafeAreaKnown = NO;
static UIEdgeInsets sideSafeArea;

// 0 on every phone that has no vertical bar: all phones but the iPhone Duo.
- (NSInteger) getVerticalBarEdge
{
  NSInteger edge = XamanVerticalBarEdge([self keyWindow].traitCollection);
  if (edge != 0) {
    verticalBarEdgeSeen = edge;
  }
  return verticalBarEdgeSeen;
}

- (NSDictionary *) getLayoutInsets
{
  UIWindow *window = [self keyWindow];

  UIEdgeInsets insets = window.safeAreaInsets;

  // iPhone Duo: the camera corner is a safe area on the right of a window that has a root view controller, but a
  // safe area at the top of a window that has none. A reload of the JavaScript side reads the insets in that second
  // state (react-native-navigation took the root away), and the app would lay out for the full width. So the insets
  // with a side safe area are kept, and they are the answer while the window has no root view controller.
  // On every other phone no side safe area is ever seen, and nothing here changes what is reported.
  if (insets.left > 0.0 || insets.right > 0.0) {
    sideSafeArea = insets;
    sideSafeAreaKnown = YES;
  } else if (sideSafeAreaKnown && (window == nil || window.rootViewController == nil)) {
    insets = sideSafeArea;
  }

  // Non-notch phones still have a 20pt status bar. keyWindow is often nil
  // at constantsToExport time on iOS 13+, which would report top=0.
  if (insets.top < 1.0 && !UIApplication.sharedApplication.isStatusBarHidden) {
    insets.top = 20.0;
  }

  // A safe area on a side of the screen while the app is in portrait: 0 on every phone, except one that has a part
  // of the system on a side (iPhone Duo: the status area and the tab bar are on the right). The app then keeps its
  // content out of that side (src/theme/sizes.ts, src/common/helpers/sideSafeArea.tsx).
  return @{
    @"top": @(insets.top),
    @"bottom": @(insets.bottom),
    @"left": @(MAX(0.0, insets.left)),
    @"right": @(MAX(0.0, insets.right))
  };
}

- (UIWindow *)keyWindow
{
  UIWindow *window = nil;
  if (@available(iOS 13.0, *)) {
    for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
      if (scene.activationState != UISceneActivationStateForegroundActive) {
        continue;
      }
      if (![scene isKindOfClass:[UIWindowScene class]]) {
        continue;
      }
      UIWindowScene *windowScene = (UIWindowScene *)scene;
      for (UIWindow *candidate in windowScene.windows) {
        if (candidate.isKeyWindow) {
          window = candidate;
          break;
        }
      }
      if (!window) {
        window = windowScene.windows.firstObject;
      }
      if (window) {
        break;
      }
    }
  }
  if (!window) {
    window = UIApplication.sharedApplication.keyWindow;
  }
  return window;
}

- (NSDictionary *)getTabBarMetrics
{
  // Compact UITabBar item row is 49pt. Home indicator is extra chrome below it.
  CGFloat itemHeight = 49.0;
  UIWindow *window = [self keyWindow];
  if (!window) {
    return @{
      @"itemHeight": @(itemHeight),
      @"height": @(itemHeight),
    };
  }
  CGFloat bottom = window.safeAreaInsets.bottom;
  UIViewController *root = window.rootViewController;
  while (root.presentedViewController) {
    root = root.presentedViewController;
  }
  UITabBar *tabBar = nil;
  if ([root isKindOfClass:[UITabBarController class]]) {
    tabBar = [(UITabBarController *)root tabBar];
  } else if (root.tabBarController) {
    tabBar = root.tabBarController.tabBar;
  }
  CGFloat height = itemHeight + bottom;
  if (tabBar && tabBar.bounds.size.height > 1.0) {
    height = tabBar.bounds.size.height;
    itemHeight = MAX(49.0, height - bottom);
  }
  return @{
    @"itemHeight": @(itemHeight),
    @"height": @(height),
  };
}


- (NSArray *)pathsToCheck
{
  return @[
    @"/Applications/Cydia.app",
    @"/Library/MobileSubstrate/MobileSubstrate.dylib",
    @"/bin/bash",
    @"/usr/sbin/sshd",
    @"/etc/apt",
    @"/private/var/lib/apt",
    @"/usr/sbin/frida-server",
    @"/usr/bin/cycript",
    @"/usr/local/bin/cycript",
    @"/usr/lib/libcycript.dylib",
    @"/Applications/FakeCarrier.app",
    @"/Applications/Icy.app",
    @"/Applications/IntelliScreen.app",
    @"/Applications/MxTube.app",
    @"/Applications/RockApp.app",
    @"/Applications/SBSettings.app",
    @"/Applications/WinterBoard.app",
    @"/Applications/blackra1n.app",
    @"/Library/MobileSubstrate/DynamicLibraries/LiveClock.plist",
    @"/Library/MobileSubstrate/DynamicLibraries/Veency.plist",
    @"/System/Library/LaunchDaemons/com.ikey.bbot.plist",
    @"/System/Library/LaunchDaemons/com.saurik.Cydia.Startup.plist",
    @"/bin/sh",
    @"/etc/ssh/sshd_config",
    @"/private/var/lib/cydia",
    @"/private/var/mobile/Library/SBSettings/Themes",
    @"/private/var/stash",
    @"/private/var/tmp/cydia.log",
    @"/usr/bin/sshd",
    @"/usr/libexec/sftp-server",
    @"/usr/libexec/ssh-keysign",
    @"/var/cache/apt",
    @"/var/lib/apt",
    @"/var/lib/cydia",
  ];
}

- (NSArray *)schemesToCheck
{
  return @[
    @"cydia://package/com.example.package",
  ];
}

- (BOOL)checkPaths
{
  BOOL existsPath = NO;
  
  for (NSString *path in [self pathsToCheck]) {
    if ([[NSFileManager defaultManager] fileExistsAtPath:path]){
      existsPath = YES;
      break;
    }
  }
  
  return existsPath;
}

- (BOOL)checkSchemes
{
  BOOL canOpenScheme = NO;
  
  for (NSString *scheme in [self schemesToCheck]) {
    if([[UIApplication sharedApplication] canOpenURL:[NSURL URLWithString:scheme]]){
      canOpenScheme = YES;
      break;
    }
  }
  
  return canOpenScheme;
}

- (BOOL)canViolateSandbox{
  NSString *JMJailbreakTextFile = @"/private/jailbreak.txt";
  NSError *error;
  BOOL grantsToWrite = NO;
  NSString *stringToBeWritten = @"This is an anti-spoofing test.";
  [stringToBeWritten writeToFile:JMJailbreakTextFile atomically:YES
                        encoding:NSUTF8StringEncoding error:&error];
  if(!error){
    //Device is jailbroken
    grantsToWrite = YES;
  }
  
  [[NSFileManager defaultManager] removeItemAtPath:JMJailbreakTextFile error:nil];
  
  return grantsToWrite;
}


RCT_REMAP_METHOD(isJailBroken, jailbreak_resolver:(RCTPromiseResolveBlock)resolve  rejecter:(RCTPromiseRejectBlock)reject)
{
#if TARGET_IPHONE_SIMULATOR
  // the simulator sees the host filesystem (/bin/bash, /usr/sbin/sshd, ...) so the
  // path checks always flag it as jailbroken, hanging Release builds on the splash screen
  resolve(@NO);
#else
  if([self checkPaths] || [self checkSchemes] || [self canViolateSandbox]) {
    resolve(@YES);
  }
  else {
    resolve(@NO);
  }
#endif
}

RCT_EXPORT_METHOD(getElapsedRealtime: (RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  struct timeval boottime;
  int mib[2] = {CTL_KERN, KERN_BOOTTIME};
  size_t size = sizeof(boottime);
  time_t now;
  time_t uptime = -1;
  
  (void) time(&now);
  
  if (sysctl(mib, 2, &boottime, &size, NULL, 0) != -1 && boottime.tv_sec != 0) {
    uptime = now - (boottime.tv_sec);
  }
  
  resolve([NSString stringWithFormat:@"%ld", uptime]);
}


RCT_EXPORT_METHOD(getTimeZone:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  @try{
    NSTimeZone *timeZone = [NSTimeZone localTimeZone];
    resolve(timeZone.name);
  }
  @catch(NSException *exception){
    NSMutableDictionary * info = [NSMutableDictionary dictionary];
    [info setValue:exception.name forKey:@"ExceptionName"];
    [info setValue:exception.reason forKey:@"ExceptionReason"];
    [info setValue:exception.userInfo forKey:@"ExceptionUserInfo"];
    NSError *error = [[NSError alloc] initWithDomain:@"getTimeZone Module" code:0 userInfo:info];
    reject(@"failed to execute",@"",error);
  }
}

RCT_EXPORT_METHOD(getLocalSetting:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  @try{
    NSLocale *locale = [NSLocale currentLocale];
    NSString *languageCode = [[NSLocale preferredLanguages] objectAtIndex:0];
    
    resolve(@{
      @"locale": [locale localeIdentifier],
      @"languageCode": [languageCode lowercaseString],
      @"separator": [locale objectForKey:NSLocaleDecimalSeparator],
      @"delimiter": [locale objectForKey:NSLocaleGroupingSeparator],
    });
  }
  @catch(NSException *exception){
    NSMutableDictionary * info = [NSMutableDictionary dictionary];
    [info setValue:exception.name forKey:@"ExceptionName"];
    [info setValue:exception.reason forKey:@"ExceptionReason"];
    [info setValue:exception.userInfo forKey:@"ExceptionUserInfo"];
    NSError *error = [[NSError alloc] initWithDomain:@"getLocalSetting Module" code:0 userInfo:info];
    reject(@"failed to execute",@"",error);
  }
}

@end

#pragma mark - SideSafeAreaView

// A view that tells the JavaScript side its own safe area on the left and right, its width and height, and the edge
// of the vertical bar, each time one of them changes. Only made on a phone with a vertical bar (iPhone Duo): there these
// change while the app runs (the phone is opened or closed, the app goes to one half of the screen), and they are
// not the same for every view (in one half the tab bar is in the safe area of a tab, not in that of the window).
// See src/common/helpers/sideSafeArea.tsx.
@interface SideSafeAreaView : RCTView
@property (nonatomic, copy) RCTDirectEventBlock onSideSafeAreaChange;
@end

@implementation SideSafeAreaView {
  BOOL _reported;
  CGFloat _left;
  CGFloat _right;
  CGFloat _width;
  CGFloat _height;
  NSInteger _edge;
}

- (void)setOnSideSafeAreaChange:(RCTDirectEventBlock)onSideSafeAreaChange
{
  _onSideSafeAreaChange = [onSideSafeAreaChange copy];
  _reported = NO;
  [self report];
}

- (void)safeAreaInsetsDidChange
{
  [super safeAreaInsetsDidChange];
  [self report];
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  [self report];
}

- (void)didMoveToWindow
{
  [super didMoveToWindow];
  [self report];
}

- (void)traitCollectionDidChange:(UITraitCollection *)previousTraitCollection
{
  [super traitCollectionDidChange:previousTraitCollection];
  [self report];
}

- (void)report
{
  if (_onSideSafeAreaChange == nil || self.window == nil) {
    return;
  }
  UIEdgeInsets insets = self.safeAreaInsets;
  CGFloat left = MAX(0.0, insets.left);
  CGFloat right = MAX(0.0, insets.right);
  CGFloat width = self.bounds.size.width;
  CGFloat height = self.bounds.size.height;
  NSInteger edge = XamanVerticalBarEdge(self.traitCollection);
  if (edge == 0) {
    edge = XamanVerticalBarEdge(self.window.traitCollection);
  }
  if (width <= 0.0) {
    return;
  }
  if (_reported && ABS(left - _left) < 0.5 && ABS(right - _right) < 0.5 && ABS(width - _width) < 0.5 &&
      ABS(height - _height) < 0.5 && edge == _edge) {
    return;
  }
  _reported = YES;
  _left = left;
  _right = right;
  _width = width;
  _height = height;
  _edge = edge;
  _onSideSafeAreaChange(
      @{ @"left" : @(left), @"right" : @(right), @"width" : @(width), @"height" : @(height), @"edge" : @(edge) });
}

@end

@interface SideSafeAreaViewManager : RCTViewManager
@end

@implementation SideSafeAreaViewManager

RCT_EXPORT_MODULE(SideSafeAreaView)

RCT_EXPORT_VIEW_PROPERTY(onSideSafeAreaChange, RCTDirectEventBlock)

- (UIView *)view
{
  return [SideSafeAreaView new];
}

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

@end
