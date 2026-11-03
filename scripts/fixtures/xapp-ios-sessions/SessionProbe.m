#import "XamanOttSchemeHandler.h"
#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

@interface SessionProbe : UIResponder <UIApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate>
@property(nonatomic, strong) UIWindow *window;
@property(nonatomic, strong) WKWebView *webView;
@property(nonatomic, strong) WKWebView *secondView;
@property(nonatomic, strong) NSMutableArray *records;
@property(nonatomic, copy) NSString *base;
@property(nonatomic, assign) BOOL proxy;
@property(nonatomic, assign) BOOL testingLoop;
@end

@implementation SessionProbe
- (BOOL)application:(UIApplication *)app didFinishLaunchingWithOptions:(NSDictionary *)options {
  NSArray *args = NSProcessInfo.processInfo.arguments;
  self.base = args[1];
  self.proxy = [args[2] isEqual:@"proxy"];
  self.records = [NSMutableArray array];
  self.window = [[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
  self.window.rootViewController = [UIViewController new];
  [self.window makeKeyAndVisible];
  self.webView = [self open:@"/start"];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 60 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
    [self finish:@"timeout"];
  });
  return YES;
}

- (WKWebView *)open:(NSString *)path {
  WKWebViewConfiguration *config = [WKWebViewConfiguration new];
  // The app wrapper enforces incognito; this is the package's incognito store.
  config.websiteDataStore = [WKWebsiteDataStore nonPersistentDataStore];
  [config.userContentController addScriptMessageHandler:self name:@"probe"];
  __block WKWebView *view;
  if (self.proxy) {
    XamanOttSchemeHandler *handler = [XamanOttSchemeHandler new];
    [XamanOttSchemeHandler claimBuiltinSchemesWhile:^{
      [config setURLSchemeHandler:handler forURLScheme:@"http"];
      [config setURLSchemeHandler:handler forURLScheme:@"https"];
      view = [[WKWebView alloc] initWithFrame:self.window.bounds configuration:config];
    }];
  } else {
    view = [[WKWebView alloc] initWithFrame:self.window.bounds configuration:config];
  }
  view.customUserAgent = self.proxy ? @"xumm/xapp:364 (ott:synthetic-local-test)" : @"xumm/session-control";
  view.navigationDelegate = self;
  [self.window.rootViewController.view addSubview:view];
  [view loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:[self.base stringByAppendingString:path]]]];
  return view;
}

- (void)close:(WKWebView *)view {
  [view stopLoading];
  [view.configuration.userContentController removeScriptMessageHandlerForName:@"probe"];
  [view removeFromSuperview];
  [view.configuration.websiteDataStore removeDataOfTypes:[WKWebsiteDataStore allWebsiteDataTypes]
                                           modifiedSince:[NSDate dateWithTimeIntervalSince1970:0]
                                       completionHandler:^{
                                       }];
}

- (void)navigate:(NSString *)path {
  [self.webView
      loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:[self.base stringByAppendingString:path]]]];
}

- (void)post:(NSString *)path {
  NSMutableURLRequest *request =
      [NSMutableURLRequest requestWithURL:[NSURL URLWithString:[self.base stringByAppendingString:path]]];
  request.HTTPMethod = @"POST";
  request.HTTPBody = [@"value=synthetic" dataUsingEncoding:NSUTF8StringEncoding];
  [request setValue:@"application/x-www-form-urlencoded" forHTTPHeaderField:@"Content-Type"];
  [self.webView loadRequest:request];
}

- (void)finish:(NSString *)error {
  NSDictionary *result = @{@"proxy" : @(self.proxy), @"records" : self.records, @"error" : error ?: [NSNull null]};
  NSData *data = [NSJSONSerialization dataWithJSONObject:result options:0 error:NULL];
  printf("PROBE_RESULT %s\n", [[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] UTF8String]);
  fflush(stdout);
  exit(error ? 1 : 0);
}

- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message {
  [self.records addObject:message.body];
  NSString *phase = message.body[@"phase"];
  if ([phase isEqual:@"next"]) {
    [self navigate:@"/redirect"];
  } else if ([phase isEqual:@"after-redirect"]) {
    [self.webView evaluateJavaScript:@"document.cookie='client=; Max-Age=0; Path=/'; location.href='/after-delete';"
                   completionHandler:nil];
  } else if ([phase isEqual:@"after-delete"]) {
    self.secondView = [self open:@"/isolated"];
  } else if ([phase isEqual:@"isolated"]) {
    [self close:self.secondView];
    self.secondView = nil;
    // The other view's asynchronous cleanup must not erase this view's state.
    [self navigate:@"/still-alive"];
  } else if ([phase isEqual:@"still-alive"]) {
    [self post:@"/post-redirect-307"];
  } else if ([phase isEqual:@"post-final-307"]) {
    [self post:@"/post-redirect-303"];
  } else if ([phase isEqual:@"post-final-303"]) {
    NSMutableURLRequest *request = [NSMutableURLRequest
        requestWithURL:[NSURL URLWithString:[self.base stringByAppendingString:@"/cross-redirect"]]];
    [request setValue:@"synthetic-private" forHTTPHeaderField:@"Authorization"];
    [self.webView loadRequest:request];
  } else if ([phase isEqual:@"cross-target"]) {
    [self navigate:@"/logout"];
  } else if ([phase isEqual:@"after-logout"]) {
    [self close:self.webView];
    self.webView = [self open:@"/fresh"];
  } else if ([phase isEqual:@"fresh"]) {
    if (self.proxy) {
      self.testingLoop = YES;
      [self navigate:@"/loop"];
    } else {
      [self finish:nil];
    }
  }
}

- (void)webView:(WKWebView *)webView
    didFailProvisionalNavigation:(WKNavigation *)navigation
                       withError:(NSError *)error {
  // Match RNCWebViewImpl's handling of replaced/redirected provisional loads.
  if (([error.domain isEqual:NSURLErrorDomain] && error.code == NSURLErrorCancelled) ||
      ([error.domain isEqual:@"WebKitErrorDomain"] && (error.code == 101 || error.code == 102))) {
    return;
  }
  if (self.testingLoop && error.code == NSURLErrorHTTPTooManyRedirects) {
    [self.records addObject:@{@"phase" : @"loop-limit"}];
    [self finish:nil];
    return;
  }
  [self finish:error.description];
}

- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
  [self finish:error.description];
}
@end

int main(int argc, char **argv) {
  @autoreleasepool {
    return UIApplicationMain(argc, argv, nil, NSStringFromClass(SessionProbe.class));
  }
}
