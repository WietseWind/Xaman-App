#!/usr/bin/env python3
"""Compile and exercise production iOS crypto/cipher/bridge sources on macOS.
Uses a fixed synthetic device ID and React bridge declarations, never Keychain.
Also compiles the changed Swift/ObjC interfaces for the iOS simulator SDK.
"""
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
CRYPTO = ROOT / "ios/Xaman/Libs/Security/Crypto"
CIPHER = ROOT / "ios/Xaman/Libs/Security/Vault/Cipher"

def run(args, **kwargs):
    result = subprocess.run(list(map(str, args)), capture_output=True, text=True, **kwargs)
    if result.returncode:
        print((result.stdout + result.stderr)[-8000:])
        result.check_returncode()
    print(result.stdout, end="")

with tempfile.TemporaryDirectory(prefix="xaman-ios-vault-") as folder:
    tmp = Path(folder)
    (tmp / "Bridging.h").write_text("")
    react = tmp / "React"
    react.mkdir()
    (react / "RCTBridgeModule.h").write_text("""
#import <Foundation/Foundation.h>
@protocol RCTBridgeModule @end
typedef void (^RCTPromiseResolveBlock)(id);
typedef void (^RCTPromiseRejectBlock)(NSString *, NSString *, NSError *);
#define RCT_EXPORT_MODULE(...)
#define RCT_EXPORT_METHOD(method) - (void)method
#define RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(method) - (id)method
""")
    (tmp / "UniqueIdProvider.h").write_text("""
#import <Foundation/Foundation.h>
@interface UniqueIdProviderModule : NSObject
+ (NSString *)getDeviceUniqueId;
@end
""")
    (tmp / "fixture.m").write_text(r"""
#import <Foundation/Foundation.h>
#import "Cipher.h"
#import "Xaman-Swift.h"
#import "Crypto.h"
#import "UniqueIdProvider.h"
@interface CryptoModule (Fixture)
- (void)hmac256:(NSString *)input key:(NSString *)key resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;
@end
@implementation UniqueIdProviderModule
+ (NSString *)getDeviceUniqueId { return @"fixture-device-id"; }
@end
static int cases;
static void check(BOOL result) { if (!result) abort(); cases++; }
static NSString *json(id value) {
  return [[NSString alloc] initWithData:[NSJSONSerialization dataWithJSONObject:value options:0 error:NULL] encoding:NSUTF8StringEncoding];
}
static void rejects(NSString *cipher, NSString *metadata) {
  NSError *error = nil;
  check([Cipher decrypt:cipher key:@"Secret Key" derivedKeysString:metadata error:&error] == nil && error != nil);
}
int main(void) {
 @autoreleasepool {
  NSError *error = nil;
  check([[Cipher decrypt:@"Shq6UW2DphA9x/PLxnlCjA==" key:@"Secret Key" derivedKeysString:@"281dbfaeacea835d338ef73a840203a9" error:&error] isEqualToString:@"Hello World"] && error == nil);
  NSDictionary *record = [Cipher encrypt:@"fixture secret" key:@"Secret Key" error:&error];
  check(record != nil && error == nil);
  NSDictionary *metadata = record[@"derived_keys"];
  NSString *cipher = record[@"cipher"];
  check([[Cipher decrypt:cipher key:@"Secret Key" derivedKeysString:json(metadata) error:&error] isEqualToString:@"fixture secret"] && error == nil);
  for (NSString *field in @[@"iv", @"passcode_salt", @"pre_key_salt", @"encr_key_salt"]) {
    for (id bad in @[@"", @"0", @"zz", @"00zz", @"+1", @"00", [NSNull null], @42, @[]]) {
      NSMutableDictionary *mutated = [metadata mutableCopy]; mutated[field] = bad;
      rejects(cipher, json(mutated));
    }
    NSMutableDictionary *missing = [metadata mutableCopy]; [missing removeObjectForKey:field];
    rejects(cipher, json(missing));
  }
  for (NSString *bad in @[@"", @"0", @"zz", @"00zz", @"+1", @"00"]) rejects(bad, json(metadata));
  for (NSString *bad in @[@"", @"0", @"zz", @"00zz", @"00", @"[]", @"{}", @"{\"version\":null}", @"{\"version\":\"2\"}", @"{\"version\":2,\"iv\":null}"]) rejects(@"Shq6UW2DphA9x/PLxnlCjA==", bad);
  rejects(cipher, nil);
  check([Cipher decrypt:cipher key:@"Secret Key" derivedKeysString:@"zz" error:NULL] == nil);
  for (NSString *bad in @[@"", @"0", @"zz", @"00zz"]) {
    __block int resolved=0, rejected=0;
    [[[CryptoModule alloc] init] hmac256:@"fixture" key:bad resolver:^(id value){resolved++;} rejecter:^(NSString *code, NSString *message, NSError *e){rejected++;check(e!=nil);}];
    check(resolved==0 && rejected==1);
  }
  __block int resolved=0, rejected=0;
  [[[CryptoModule alloc] init] hmac256:@"Hello World" key:@"536563726574204b6579" resolver:^(id value){resolved++;check([value isEqual:@"ba4f7d6c4547be22bd697e0610575ad7068ba7086e17dea752a97476fc2be9ba"]);} rejecter:^(NSString *code, NSString *message, NSError *e){rejected++;}];
  check(resolved==1 && rejected==0);
  printf("iOS production cipher/bridge: %d cases passed; v1 CBC and v2 GCM compatibility verified\n", cases);
 }
 return 0;
}
""")
    sources = [CIPHER / "Cipher.m", CIPHER / "V1+AesCbc.m", CIPHER / "V2+AesGcm.m", CRYPTO / "Crypto.m"]
    includes = ["-I", tmp, "-I", CIPHER, "-I", CRYPTO]
    run(["xcrun", "swiftc", CRYPTO / "Crypto.swift", "-import-objc-header", tmp / "Bridging.h", "-emit-library", "-emit-module", "-enable-testing", "-module-name", "Xaman", "-emit-module-path", tmp / "Xaman.swiftmodule", "-emit-objc-header-path", tmp / "Xaman-Swift.h", "-o", tmp / "libXaman.dylib"])
    objects = []
    for index, source in enumerate([*sources, tmp / "fixture.m"]):
        obj = tmp / f"source-{index}.o"
        run(["xcrun", "clang", "-fobjc-arc", "-fblocks", "-fmodules", *includes, "-c", source, "-o", obj])
        objects.append(obj)
    run(["xcrun", "swiftc", *objects, "-L", tmp, "-lXaman", "-framework", "Foundation", "-Xlinker", "-rpath", "-Xlinker", tmp, "-o", tmp / "cipher-tests"])
    run([tmp / "cipher-tests"])
    (tmp / "main.swift").write_text("""
import XCTest
let suite = CryptoTest.defaultTestSuite
suite.run()
guard let result = suite.testRun, result.hasSucceeded else { fatalError("Crypto XCTest failures") }
print("Swift Crypto XCTest: \(result.executionCount) tests passed")
""")
    developer = Path(subprocess.check_output(["xcode-select", "-p"], text=True).strip())
    frameworks = developer / "Platforms/MacOSX.platform/Developer/Library/Frameworks"
    swift_test_libs = developer / "Platforms/MacOSX.platform/Developer/usr/lib"
    # Compile the same test bodies alongside production Swift, avoiding a host-only
    # test module that imports an ephemeral compiler-generated bridging PCH.
    (tmp / "CryptoTest.swift").write_text((ROOT / "ios/XamanTests/CryptoTest.swift").read_text().replace("@testable import Xaman", ""))
    run(["xcrun", "swiftc", "-I", swift_test_libs, "-L", swift_test_libs, "-Xlinker", "-rpath", "-Xlinker", swift_test_libs, "-F", frameworks, "-Xlinker", "-rpath", "-Xlinker", frameworks, CRYPTO / "Crypto.swift", tmp / "CryptoTest.swift", tmp / "main.swift", "-o", tmp / "crypto-tests"])
    run([tmp / "crypto-tests"])
    sdk = subprocess.check_output(["xcrun", "--sdk", "iphonesimulator", "--show-sdk-path"], text=True).strip()
    target = "arm64-apple-ios15.0-simulator"
    run(["xcrun", "swiftc", CRYPTO / "Crypto.swift", "-import-objc-header", tmp / "Bridging.h", "-sdk", sdk, "-target", target, "-emit-module", "-module-name", "Xaman", "-emit-module-path", tmp / "iOS.swiftmodule", "-emit-objc-header-path", tmp / "Xaman-Swift.h"])
    for source in sources:
        run(["xcrun", "clang", "-fobjc-arc", "-fblocks", "-fmodules", "-target", target, "-isysroot", sdk, *includes, "-fsyntax-only", source])
    print("iOS simulator Swift/Objective-C compile checks passed")
