#import "XamanOttSchemeHandler.m"
#import <Foundation/Foundation.h>
static NSUInteger checks;
static void check(BOOL value, NSString *message) {
  checks++;
  if (!value) {
    NSLog(@"FAIL: %@", message);
    exit(1);
  }
}
static NSMutableURLRequest *req(NSString *url, NSString *site, NSString *dest) {
  NSMutableURLRequest *r = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:url]];
  r.mainDocumentURL = [NSURL URLWithString:@"https://app.example.test/start"];
  [r setValue:site forHTTPHeaderField:@"Sec-Fetch-Site"];
  [r setValue:dest forHTTPHeaderField:@"Sec-Fetch-Dest"];
  return r;
}
static NSArray *parse(NSString *header, NSString *url) {
  return [NSHTTPCookie cookiesWithResponseHeaderFields:@{@"Set-Cookie" : header} forURL:[NSURL URLWithString:url]];
}
static NSDictionary *changes(XamanOttSchemeHandler *h, NSString *header, NSURLRequest *request, NSArray *stored) {
  NSHTTPURLResponse *response = [[NSHTTPURLResponse alloc] initWithURL:request.URL
                                                            statusCode:200
                                                           HTTPVersion:@"HTTP/1.1"
                                                          headerFields:@{@"Set-Cookie" : header}];
  return [h cookieChangesFromResponse:response request:request storedCookies:stored];
}
int main(void) {
  @autoreleasepool {
    XamanOttSchemeHandler *h = [XamanOttSchemeHandler new];
  NSURL *https = [NSURL URLWithString:@"https://app.example.test/start"];
  check([h allowsRedirectFromURL:https toURL:[NSURL URLWithString:@"https://other.example.test/end"]],
        @"HTTPS redirect allowed");
  check(![h allowsRedirectFromURL:https toURL:[NSURL URLWithString:@"http://app.example.test/end"]],
        @"no HTTPS downgrade");
  check(![h allowsRedirectFromURL:https toURL:[NSURL URLWithString:@"file:///private/test"]], @"no file redirect");
  check(![h allowsRedirectFromURL:https toURL:[NSURL URLWithString:@"javascript:void(0)"]], @"no script redirect");
    NSString *base = @"https://app.example.test/start";
    NSMutableURLRequest *same = req(base, @"same-origin", @"empty");
    NSMutableArray *cookies = [NSMutableArray array];
    for (NSString *header in @[
           @"lax=1; Path=/; SameSite=Lax", @"strict=1; Path=/; SameSite=Strict",
           @"none=1; Path=/; SameSite=None; Secure"
         ])
      [cookies addObjectsFromArray:parse(header, base)];
    check([h cookiesForRequest:same storedCookies:cookies].count == 3, @"same site");
    NSMutableURLRequest *cross = req(base, @"cross-site", @"empty");

    check([h cookiesForRequest:cross storedCookies:cookies].count == 1, @"cross-site subresource only None");
    [cross setValue:@"document" forHTTPHeaderField:@"Sec-Fetch-Dest"];
    check([h cookiesForRequest:cross storedCookies:cookies].count == 2, @"cross-site GET navigation Lax");
    cross.HTTPMethod = @"POST";
    check([h cookiesForRequest:cross storedCookies:cookies].count == 1, @"cross-site POST no Lax");
    same.HTTPShouldHandleCookies = NO;
    check([h cookiesForRequest:same storedCookies:cookies].count == 0, @"credentials omit send");
    check([changes(h, @"omit=bad; Path=/", same, @[])[@"set"] count] == 0, @"credentials omit receive");
    same.HTTPShouldHandleCookies = YES;
    for (NSString *invalid in @[
           @"foreign=bad; Domain=unrelated.invalid; Path=/", @"public=bad; Domain=test; Path=/",
           @"__Host-bad=bad; Domain=example.test; Path=/; Secure", @"__Secure-bad=bad; Path=/"
         ]) {
      check([changes(h, invalid, same, @[])[@"set"] count] == 0,
            [NSString stringWithFormat:@"invalid response %@", invalid]);
    }
    check([changes(h, @"PHPSESSID=good; Path=/; HttpOnly; Secure; SameSite=None", same, @[])[@"set"] count] == 1,
          @"Mail session accepted");
    NSDictionary *rotation = changes(h, @"lax=2; Path=/; SameSite=Lax", same, cookies);
    check([rotation[@"set"] count] == 1, @"one rotated cookie only");
    check([[(NSHTTPCookie *)[rotation[@"set"] firstObject] value] isEqual:@"2"], @"rotated value");
    NSDictionary *deletion = changes(h, @"lax=; Max-Age=0; Path=/", same, cookies);
    check([deletion[@"set"] count] == 0 && [deletion[@"delete"] count] == 1, @"server deletion");
    check([changes(h, @"PHPSESSID=good; Path=/", same, @[])[@"set"] count] == 1, @"no resurrected JS cookie");
    NSMutableArray *scoped = [NSMutableArray array];
    [scoped addObjectsFromArray:parse(@"host=1; Path=/", base)];
    [scoped addObjectsFromArray:parse(@"path=1; Path=/private", base)];
    [scoped addObjectsFromArray:parse(@"secure=1; Path=/; Secure", base)];
    check([h cookiesForRequest:same storedCookies:scoped].count == 2, @"path scope");
    check([h cookiesForRequest:req(@"https://app.example.test/private/next", @"same-origin", @"empty")
                 storedCookies:scoped]
                  .count == 3,
          @"path included");
    check([h cookiesForRequest:req(@"https://app.example.test/private-other", @"same-origin", @"empty")
                 storedCookies:scoped]
                  .count == 2,
          @"path boundary");
    check([h cookiesForRequest:req(@"http://app.example.test/start", @"same-origin", @"empty") storedCookies:scoped]
                  .count == 1,
          @"Secure excluded on HTTP");
    check([h cookiesForRequest:req(@"https://other.example.test/start", @"same-site", @"empty") storedCookies:scoped]
                  .count == 0,
          @"host-only no sibling");
    check([h cookiesForRequest:req(@"https://sub.app.example.test/start", @"same-site", @"empty") storedCookies:scoped]
                  .count == 0,
          @"host-only no subdomain");
    check([h cookiesForRequest:req(@"https://unrelated.invalid/start", @"cross-site", @"empty") storedCookies:scoped]
                  .count == 0,
          @"unrelated host");
    NSMutableURLRequest *crossResource = req(base, @"cross-site", @"empty");
    check([changes(h, @"lax=bad; Path=/; SameSite=Lax", crossResource, @[])[@"set"] count] == 0,
          @"cross-site subresource cannot set Lax");
    check([changes(h, @"none=good; Path=/; SameSite=None; Secure", crossResource, @[])[@"set"] count] == 1,
          @"cross-site subresource can set None");
    NSArray *httpOnly = parse(@"PHPSESSID=old; Path=/; HttpOnly; SameSite=Lax", base);
    check([changes(h, @"PHPSESSID=; Max-Age=0; Path=/", same, httpOnly)[@"delete"] count] == 1,
          @"delete HttpOnly without repeating the attribute");
    NSDictionary *downgrade = changes(h, @"PHPSESSID=new; Path=/", same, httpOnly);
    check([downgrade[@"set"] count] == 1 && ![(NSHTTPCookie *)[downgrade[@"set"] firstObject] isHTTPOnly],
          @"server controls new HttpOnly attribute");
    NSArray *hostOnly = parse(@"__Host-session=old; Path=/; Secure; HttpOnly", base);
    NSDictionary *invalidHost =
        changes(h, @"__Host-session=new; Domain=app.example.test; Path=/; Secure", same, hostOnly);
    check([invalidHost[@"set"] count] == 0 && [invalidHost[@"delete"] count] == 0,
          @"invalid prefix cannot downgrade an existing HttpOnly cookie");
    NSMutableURLRequest *ip = req(@"http://127.0.0.1:12345/logout", @"cross-site", @"document");
    ip.mainDocumentURL = [NSURL URLWithString:@"http://localhost:12345/page"];
    NSArray *ipCookie = parse(@"PHPSESSID=old; Path=/; HttpOnly; SameSite=Lax", @"http://127.0.0.1:12345/start");
    check([changes(h, @"PHPSESSID=; Max-Age=0; Path=/", ip, ipCookie)[@"delete"] count] == 1,
          @"delete session after returning from another origin");
    printf("Cookie policy: %lu checks passed\n", (unsigned long)checks);
  }
  return 0;
}
