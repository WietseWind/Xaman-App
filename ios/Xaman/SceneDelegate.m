#import "SceneDelegate.h"
#import "AppDelegate.h"

#import <React/RCTLinkingManager.h>

@implementation SceneDelegate

- (void)scene:(UIScene *)scene
    willConnectToSession:(UISceneSession *)session
                 options:(UISceneConnectionOptions *)connectionOptions
{
    if (![scene isKindOfClass:[UIWindowScene class]]) {
        return;
    }

    UIWindowScene *windowScene = (UIWindowScene *)scene;
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

- (void)scene:(UIScene *)scene continueUserActivity:(NSUserActivity *)userActivity
{
    [RCTLinkingManager application:UIApplication.sharedApplication
              continueUserActivity:userActivity
                restorationHandler:^(NSArray<id<UIUserActivityRestoring>> *_Nullable restorableObjects){
                }];
}

@end
