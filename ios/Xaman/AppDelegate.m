#import "AppDelegate.h"
#import "SceneDelegate.h"
#import "SecurityProvider.h"

#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>

#import <Firebase.h>
#import <ReactNativeNavigation/ReactNativeNavigation.h>

#import "Libs/Notification/LocalNotification.h"
#import "Libs/Security/Authentication/Biometric/BiometricModule.h"
#import "Libs/Common/InAppPurchase/InAppPurchase.h"
#import "Xaman-Swift.h"

@interface AppDelegate ()
@property (nonatomic, copy) NSDictionary *savedLaunchOptions;
@property (nonatomic, assign) BOOL didStartReactNative;
// expo-updates decided which JS bundle to launch
@property (nonatomic, assign) BOOL otaReady;
@property (nonatomic, strong) UIWindowScene *pendingScene;
@property (nonatomic, strong) UISceneConnectionOptions *pendingConnectionOptions;
- (void)otaDidStart;
@end

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application
            openURL:(NSURL *)url
            options:(NSDictionary<UIApplicationOpenURLOptionsKey,id> *)options
{
  return [RCTLinkingManager application:application openURL:url options:options];
}

- (BOOL)application:(UIApplication *)application continueUserActivity:(nonnull NSUserActivity *)userActivity
 restorationHandler:(nonnull void (^)(NSArray<id<UIUserActivityRestoring>> * _Nullable))restorationHandler
{
  return [RCTLinkingManager application:application
                   continueUserActivity:userActivity
                     restorationHandler:restorationHandler];
}

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.savedLaunchOptions = launchOptions;

  // Initialize security key early
  [SecurityProvider ensureKeyIsReady];

  // init firebase app
  [FIRApp configure];

  // over-the-air updates: pick the JS bundle (store version or a downloaded update)
  // before React Native starts
  [XamanOta prepareBeforeStart];
  __weak AppDelegate *weakSelf = self;
  [XamanOta start:^(BOOL success) {
    [weakSelf otaDidStart];
  }];

  // bootstrap local notification and Biometric module
  [LocalNotificationModule initialise];
  [BiometricModule initialise];
  [self keepClassicBarChrome];

  return YES;
}

- (void)keepClassicBarChrome
{
  UITabBarAppearance *tabAppearance = [[UITabBarAppearance alloc] init];
  [tabAppearance configureWithOpaqueBackground];
  UITabBar *tabBar = [UITabBar appearance];
  tabBar.standardAppearance = tabAppearance;
  tabBar.scrollEdgeAppearance = tabAppearance;
  tabBar.translucent = NO;

  UINavigationBarAppearance *navigationAppearance = [[UINavigationBarAppearance alloc] init];
  [navigationAppearance configureWithOpaqueBackground];
  UINavigationBar *navigationBar = [UINavigationBar appearance];
  navigationBar.standardAppearance = navigationAppearance;
  navigationBar.scrollEdgeAppearance = navigationAppearance;
  navigationBar.compactAppearance = navigationAppearance;
  navigationBar.translucent = NO;
}

- (UISceneConfiguration *)application:(UIApplication *)application
    configurationForConnectingSceneSession:(UISceneSession *)connectingSceneSession
                                   options:(UISceneConnectionOptions *)options
{
  UISceneConfiguration *configuration =
      [[UISceneConfiguration alloc] initWithName:@"Default Configuration" sessionRole:connectingSceneSession.role];
  configuration.delegateClass = [SceneDelegate class];
  return configuration;
}

- (void)startReactNativeForScene:(UIWindowScene *)windowScene
               connectionOptions:(UISceneConnectionOptions *)connectionOptions
{
  if (self.window == nil) {
    self.window = [[UIWindow alloc] initWithWindowScene:windowScene];
  } else if (self.window.windowScene != windowScene) {
    self.window.windowScene = windowScene;
  }
  self.window.frame = windowScene.coordinateSpace.bounds;

  if (!self.otaReady) {
    // expo-updates is still picking the bundle; otaDidStart continues from here
    self.pendingScene = windowScene;
    self.pendingConnectionOptions = connectionOptions;
    if (self.window.rootViewController == nil) {
      self.window.rootViewController = [[UIStoryboard storyboardWithName:@"LaunchScreen" bundle:nil] instantiateInitialViewController];
    }
    return;
  }

  if (self.didStartReactNative) {
    return;
  }
  self.didStartReactNative = YES;

  NSMutableDictionary *launchOptions = [NSMutableDictionary dictionaryWithDictionary:self.savedLaunchOptions ?: @{}];
  NSURL *url = connectionOptions.URLContexts.anyObject.URL;
  if (url != nil && launchOptions[UIApplicationLaunchOptionsURLKey] == nil) {
    launchOptions[UIApplicationLaunchOptionsURLKey] = url;
  }

  NSUserActivity *userActivity = connectionOptions.userActivities.anyObject;
  if (userActivity != nil && launchOptions[UIApplicationLaunchOptionsUserActivityDictionaryKey] == nil) {
    NSMutableDictionary *activity = [NSMutableDictionary dictionary];
    if (userActivity.activityType != nil) {
      activity[UIApplicationLaunchOptionsUserActivityTypeKey] = userActivity.activityType;
    }
    activity[@"UIApplicationLaunchOptionsUserActivityKey"] = userActivity;
    launchOptions[UIApplicationLaunchOptionsUserActivityDictionaryKey] = activity;
  }

  // The window must belong to the scene before React Native Navigation reads it.
  RCTBridge *bridge = [[RCTBridge alloc] initWithDelegate:self launchOptions:launchOptions];
  self.bridge = bridge;
  [ReactNativeNavigation bootstrapWithBridge:bridge];

  // over-the-air watchdog: a launch counts once JS starts for a screen (not a background launch)
  [XamanOta countLaunch];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self getBundleURL];
}

- (NSURL *)getBundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  // a downloaded over-the-air update, or nil for the bundle shipped with the app
  NSURL *otaBundleURL = [XamanOta launchAssetUrl];
  return otaBundleURL ?: [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

- (void)otaDidStart
{
  // attribute crashes to the running bundle before any JS runs
  NSDictionary *launch = [XamanOta launchedUpdateInfo];
  FIRCrashlytics *crashlytics = [FIRCrashlytics crashlytics];
  [crashlytics setCustomValue:launch[@"updateId"] forKey:@"ota_update_id"];
  [crashlytics setCustomValue:launch[@"otaId"] forKey:@"ota_id"];
  [crashlytics setCustomValue:launch[@"runtimeVersion"] forKey:@"ota_runtime"];
  [crashlytics setCustomValue:launch[@"isEmbedded"] forKey:@"ota_embedded"];

  self.otaReady = YES;
  if (self.pendingScene != nil) {
    UIWindowScene *scene = self.pendingScene;
    UISceneConnectionOptions *options = self.pendingConnectionOptions;
    self.pendingScene = nil;
    self.pendingConnectionOptions = nil;
    [self startReactNativeForScene:scene connectionOptions:options];
  }
}

- (NSArray<id<RCTBridgeModule>> *)extraModulesForBridge:(RCTBridge *)bridge {
  return [ReactNativeNavigation extraModulesForBridge:bridge];
}

- (UIWindow *)xamanPrivacyWindow {
  NSPredicate *isKeyWindow = [NSPredicate predicateWithFormat:@"isKeyWindow == YES"];
  UIWindow *topWindow = [[[UIApplication sharedApplication] windows] filteredArrayUsingPredicate:isKeyWindow].firstObject;
  if (topWindow == nil) {
    topWindow = self.window;
  }
  return topWindow;
}

// Hide the snapshot in the app switcher. Scene lifecycle calls this directly;
// UIKit does not deliver applicationWillResignActive once a scene manifest exists.
- (void)xamanBlurAppSwitcher {
  // ignore if user is authenticating with biometric or processing in app purchase
  if([BiometricModule isUserAuthenticating] || [InAppPurchaseModule isUserPurchasing]){
    return;
  }

  UIWindow *topWindow = [self xamanPrivacyWindow];
  if (topWindow == nil || [topWindow viewWithTag:0xDEADBEEF] != nil) {
    return;
  }

  UIViewController *rootViewController = topWindow.rootViewController;
  UIViewController *currentViewController = rootViewController;

  if ([rootViewController presentedViewController]) {
    currentViewController = [rootViewController presentedViewController];
  }

  if (currentViewController == nil || ![NSStringFromClass([currentViewController class]) hasPrefix:@"RNN"]) {
    return;
  }

  UIBlurEffect *blurEffect = [UIBlurEffect effectWithStyle:UIBlurEffectStyleLight];
  UIVisualEffectView *blurEffectView = [[UIVisualEffectView alloc] initWithEffect:blurEffect];

  blurEffectView.frame = topWindow.frame;
  blurEffectView.tag = 0xDEADBEEF;
  blurEffectView.alpha = 0;
  [topWindow addSubview:blurEffectView];
  [UIView animateWithDuration:0.5 animations:^{
    blurEffectView.alpha = 1;
  }];
}

- (void)xamanUnblurAppSwitcher {
  NSMutableArray<UIWindow *> *windows = [[[UIApplication sharedApplication] windows] mutableCopy];
  if (self.window != nil && ![windows containsObject:self.window]) {
    [windows addObject:self.window];
  }
  for (UIWindow *window in [windows reverseObjectEnumerator]) {
    UIView *blurEffectView = [window viewWithTag:0xDEADBEEF];
    if (blurEffectView) {
      [UIView animateWithDuration:0.5 animations:^{
        blurEffectView.alpha = 0;
      } completion:^(BOOL finished) {
        [blurEffectView removeFromSuperview];
      }];
      return;
    }
  }
}

- (void)applicationWillResignActive:(UIApplication *)application {
  [self xamanBlurAppSwitcher];
}

- (void)applicationDidBecomeActive:(UIApplication *)application {
  [self xamanUnblurAppSwitcher];
}

- (BOOL)application:(UIApplication *)application shouldAllowExtensionPointIdentifier:(NSString *)extensionPointIdentifier
{
  // disable custom keyboard
  if ([extensionPointIdentifier isEqualToString:@"com.apple.keyboard-service"]) {
    return NO;
  }
  return YES;
}

@end
