#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

#import <React/RCTBridgeModule.h>
#import <React/RCTRootView.h>
#import <React/RCTEventEmitter.h>
#import <React/RCTReloadCommand.h>


@interface DeviceUtilsModule : NSObject <RCTBridgeModule>

// The app on an iPad. It runs there as an iPhone app, in a window of the system (issue 553).
// isPadDevice: the device is an iPad. Always NO on an iPhone.
+ (BOOL)isPadDevice;
// The size the app is laid out for on an iPad: one phone size that fits on the screen of the device in portrait and
// in landscape. {0, 0} on an iPhone, and on an iPad whose system gives the app the screen of a phone.
+ (CGSize)padLayoutSize;

@end
