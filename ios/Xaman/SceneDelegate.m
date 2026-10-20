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

    AppDelegate *appDelegate = (AppDelegate *)UIApplication.sharedApplication.delegate;
    [appDelegate startReactNativeForScene:(UIWindowScene *)scene connectionOptions:connectionOptions];
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
