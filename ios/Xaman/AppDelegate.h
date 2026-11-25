#import <RCTAppDelegate.h>
#import <UIKit/UIKit.h>


@interface AppDelegate : RCTAppDelegate

- (void)startReactNativeForScene:(UIWindowScene *)windowScene
               connectionOptions:(UISceneConnectionOptions *)connectionOptions API_AVAILABLE(ios(13.0));

- (void)xamanBlurAppSwitcher;
- (void)xamanUnblurAppSwitcher;

@end
