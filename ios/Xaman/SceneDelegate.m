#import "SceneDelegate.h"
#import "AppDelegate.h"
#import "Libs/Utils/DeviceUtils.h"

#import <React/RCTLinkingManager.h>

@implementation SceneDelegate

// iPad (issue 553): the app has one phone layout there (DeviceUtils.m, padLayoutSize). Ask the system to keep the
// window at that size. What the system does with it (iPadOS 27.2): it holds the width when the user changes the
// size of the window, and not at the start of the app. Until then, and for the height, the app is a box of that
// size in the window it gets (src/common/helpers/sideSafeArea.tsx).
// The minimum is only set while the window is not smaller than the layout: for a smaller window the system draws
// the window at the minimum size but leaves the app in the smaller one, with a black area beside it.
// Does nothing on an iPhone.
- (void)keepPadWindowSize:(UIWindowScene *)windowScene
{
    CGSize padLayout = [DeviceUtilsModule padLayoutSize];
    UISceneSizeRestrictions *restrictions = windowScene.sizeRestrictions;
    if (padLayout.width <= 0.0 || restrictions == nil) {
        return;
    }
    restrictions.maximumSize = padLayout;
    CGSize now = windowScene.coordinateSpace.bounds.size;
    if (now.width >= padLayout.width && now.height >= padLayout.height) {
        restrictions.minimumSize = padLayout;
    }
}

- (void)scene:(UIScene *)scene
    willConnectToSession:(UISceneSession *)session
                 options:(UISceneConnectionOptions *)connectionOptions
{
    if (![scene isKindOfClass:[UIWindowScene class]]) {
        return;
    }

    UIWindowScene *windowScene = (UIWindowScene *)scene;
    [self keepPadWindowSize:windowScene];

    // UIKit delivers touches to the scene delegate's window. Leaving this nil
    // puts a system window over the top of the screen.
    if (self.window == nil) {
        self.window = [[UIWindow alloc] initWithWindowScene:windowScene];
    }

    AppDelegate *appDelegate = (AppDelegate *)UIApplication.sharedApplication.delegate;
    appDelegate.window = self.window;
    [appDelegate startReactNativeForScene:windowScene connectionOptions:connectionOptions];
    [self.window makeKeyAndVisible];
}

- (void)scene:(UIScene *)scene openURLContexts:(NSSet<UIOpenURLContext *> *)URLContexts
{
    UIOpenURLContext *context = URLContexts.anyObject;
    if (context.URL == nil) {
        return;
    }

    NSMutableDictionary *options = [NSMutableDictionary dictionary];
    if (context.options.sourceApplication != nil) {
        options[UIApplicationOpenURLOptionsSourceApplicationKey] = context.options.sourceApplication;
    }
    if (context.options.annotation != nil) {
        options[UIApplicationOpenURLOptionsAnnotationKey] = context.options.annotation;
    }
    [RCTLinkingManager application:UIApplication.sharedApplication openURL:context.URL options:options];
}

- (void)sceneWillResignActive:(UIScene *)scene
{
    AppDelegate *appDelegate = (AppDelegate *)UIApplication.sharedApplication.delegate;
    [appDelegate xamanBlurAppSwitcher];
}

- (void)sceneDidBecomeActive:(UIScene *)scene
{
    if ([scene isKindOfClass:[UIWindowScene class]]) {
        [self keepPadWindowSize:(UIWindowScene *)scene];
    }
    AppDelegate *appDelegate = (AppDelegate *)UIApplication.sharedApplication.delegate;
    [appDelegate xamanUnblurAppSwitcher];
}

- (void)scene:(UIScene *)scene continueUserActivity:(NSUserActivity *)userActivity
{
    [RCTLinkingManager application:UIApplication.sharedApplication
              continueUserActivity:userActivity
                restorationHandler:^(NSArray<id<UIUserActivityRestoring>> *_Nullable restorableObjects){
                }];
}

@end
