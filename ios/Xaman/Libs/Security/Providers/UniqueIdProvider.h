#import <Foundation/Foundation.h>

#import <React/RCTBridgeModule.h>

@interface UniqueIdProviderModule : NSObject <RCTBridgeModule>
extern NSString * const UNIQUE_UUID_KEY;
+ (NSString *)getDeviceUniqueId;
// set aside the device id an earlier install left in the shared keychain group, when the build
// without that group stored its own next to it (see Keychain setAsideSharedItem); YES when none is left
+ (BOOL)setAsideStaleSharedDeviceId;
@property(nonatomic, strong, readonly) NSString *unique_uuid;
@end
