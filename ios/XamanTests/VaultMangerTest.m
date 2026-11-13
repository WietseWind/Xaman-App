//
//  VaultManagerTest.m
//  XamanTests
//

#import <XCTest/XCTest.h>

#import "../Xaman/Libs/Security/Vault/VaultManager.h"
#import "../Xaman/Libs/Security/Vault/Cipher/Cipher.h"
#import "../Xaman/Libs/Security/Vault/Storage/Keychain.h"

#import "PerformanceLogger.h"

@interface VaultManagerTest : XCTestCase
@end

@implementation VaultManagerTest

static NSString* VAULT_NAME = @"VAULT_TEST";
static NSString* VAULT_NAME_RECOVERY = @"VAULT_TEST_RECOVER";
static NSString* VAULT_DATA = @"VAULT_TEST_DATA";
static NSString* VAULT_KEY = @"VAULT_TEST_KEY";
static NSString* VAULT_NEW_KEY = @"VAULT_TEST_NEW_KEY";
static PerformanceLogger *performanceLogger;


+ (void)setUp {
  // setup performance logger
  performanceLogger = [[PerformanceLogger alloc] initWithTag:@"VaultMangerTestReport"];

  // clear vault before starting the tests
  [VaultManagerModule clearStorage];
}

+ (void)tearDown {
  [performanceLogger log];
}

- (void)testVault {
  // should return false as vault is not exist
  [performanceLogger start:@"VAULT_EXIST_FALSE"];
  XCTAssertFalse([VaultManagerModule vaultExist:VAULT_NAME]);
  [performanceLogger end:@"VAULT_EXIST_FALSE"];
  // should create the vault with the latest cipher and store in the keychain
  [performanceLogger start:@"CREATE_VAULT_NEW"];
  XCTAssertTrue([VaultManagerModule createVault:VAULT_NAME data:VAULT_DATA key:VAULT_KEY]);
  [performanceLogger end:@"CREATE_VAULT_NEW"];
  // should return true as vault is exist
  [performanceLogger start:@"VAULT_EXIST_TRUE"];
  XCTAssertTrue([VaultManagerModule vaultExist:VAULT_NAME]);
  [performanceLogger end:@"VAULT_EXIST_TRUE"];
  // try to create the same vault again, which should raise an error
  [performanceLogger start:@"CREATE_VAULT_EXIST"];
  XCTAssertThrows([VaultManagerModule createVault:VAULT_NAME data:VAULT_DATA key:VAULT_KEY]);
  [performanceLogger end:@"CREATE_VAULT_EXIST"];
  // verify we can fetch the vault and open with the provided key
  [performanceLogger start:@"OPEN_VAULT"];
  XCTAssertTrue([VAULT_DATA isEqualToString:[VaultManagerModule openVault:VAULT_NAME key:VAULT_KEY recoverable:NO]]);
  [performanceLogger end:@"OPEN_VAULT"];
  // should return false for migration required as vault has been created with latest cipher
  [performanceLogger start:@"IS_MIGRATION_REQUIRED"];
  NSDictionary *migrationRequiredResult = [VaultManagerModule isMigrationRequired:VAULT_NAME];
  [performanceLogger end:@"IS_MIGRATION_REQUIRED"];
  XCTAssertEqual(NO, [[migrationRequiredResult valueForKey:@"migration_required"] boolValue]);
  XCTAssertEqual([[Cipher getLatestCipherVersion] intValue], [[migrationRequiredResult valueForKey:@"latest_cipher_version"] intValue]);
  XCTAssertEqual([[Cipher getLatestCipherVersion] intValue], [[migrationRequiredResult valueForKey:@"current_cipher_version"] intValue]);
  // purge vault
  [performanceLogger start:@"PURGE_VAULT"];
  XCTAssertTrue([VaultManagerModule purgeVault:VAULT_NAME]);
  [performanceLogger end:@"PURGE_VAULT"];
  // should return false as vault purged
  XCTAssertFalse([VaultManagerModule vaultExist:VAULT_NAME]);
}

- (void)testVaultRecovery{
  NSError *error;
  // check if vault && recovery vault is not exist
  XCTAssertNil([Keychain getItem:VAULT_NAME error:&error]);
  XCTAssertNil([Keychain getItem:VAULT_NAME_RECOVERY error:&error]);
  XCTAssertNil(error);
  // create recovery vault
  XCTAssertTrue([VaultManagerModule createVault:VAULT_NAME_RECOVERY data:VAULT_DATA key:VAULT_KEY]);
  // opening vault with recoverable flag should be able to restore vault
  [performanceLogger start:@"OPEN_VAULT_RECOVERED"];
  XCTAssertTrue([VaultManagerModule openVault:VAULT_NAME key:VAULT_KEY recoverable:YES]);
  [performanceLogger end:@"OPEN_VAULT_RECOVERED"];
  // check if the actual vault is there
  XCTAssertNotNil([Keychain getItem:VAULT_NAME error:&error]);
  XCTAssertNil([Keychain getItem:VAULT_NAME_RECOVERY error:&error]);
  // remove vault
  XCTAssertTrue([VaultManagerModule purgeVault:VAULT_NAME]);
}

- (void)testVaultReKey{
  NSError *error;
  // check if  vault is not exist
  XCTAssertNil([Keychain getItem:VAULT_NAME error:&error]);
  XCTAssertNil(error);
  // create the vault
  XCTAssertTrue([VaultManagerModule createVault:VAULT_NAME data:VAULT_DATA key:VAULT_KEY]);
  // should be able to reKey the vault with new key
  [performanceLogger start:@"VAULT_RE_KEY"];
  XCTAssertTrue([VaultManagerModule reKeyVault:VAULT_NAME oldKey:VAULT_KEY newKey:VAULT_NEW_KEY]);
  [performanceLogger end:@"VAULT_RE_KEY"];
  // should be able to open vault with new key
  XCTAssertTrue([VAULT_DATA isEqualToString:[VaultManagerModule openVault:VAULT_NAME key:VAULT_NEW_KEY recoverable:NO]]);
  // the recovery vault should not be exist
  XCTAssertNil([Keychain getItem:VAULT_NAME_RECOVERY error:&error]);
  XCTAssertNil(error);
  // remove vault
  XCTAssertTrue([VaultManagerModule purgeVault:VAULT_NAME]);
}

- (void)testVaultReKeyBatch{
  NSError *error;
  
  NSArray<NSString *> *vaults = @[
    [NSString stringWithFormat:@"%@%@", VAULT_NAME, @"1"],
    [NSString stringWithFormat:@"%@%@", VAULT_NAME, @"2"],
    [NSString stringWithFormat:@"%@%@", VAULT_NAME, @"3"]
  ];
  // check if vaults are not exist
  for (NSString * vaultName in vaults){
    XCTAssertNil([Keychain getItem:vaultName error:&error]);
    XCTAssertNil(error);
  }
  // create the vaults
  for (NSString * vaultName in vaults){
    XCTAssertTrue([VaultManagerModule createVault:vaultName data:VAULT_DATA key:VAULT_KEY]);
  }
  // should be able to reKey the batch of vaults
  [performanceLogger start:@"VAULT_BATCH_RE_KEY"];
  XCTAssertTrue([VaultManagerModule reKeyBatchVaults:vaults oldKey:VAULT_KEY newKey:VAULT_NEW_KEY]);
  [performanceLogger end:@"VAULT_BATCH_RE_KEY"];
  // should be able to open vaults with new key
  for (NSString * vaultName in vaults){
    XCTAssertTrue([VAULT_DATA isEqualToString:[VaultManagerModule openVault:vaultName key:VAULT_NEW_KEY recoverable:NO]]);
  }
  // the recovery vaults should not be exist
  for (NSString * vaultName in vaults){
    NSString * vaultRecoverName = [NSString stringWithFormat:@"%@%@", vaultName, @"_RECOVER"];
    XCTAssertNil([Keychain getItem:vaultRecoverName error:&error]);
    XCTAssertNil(error);
  }
}

- (void)testStorageEncryptionKey {
  NSError *error;
  // check if the key is not exist
  XCTAssertNil([Keychain getItem:STORAGE_ENCRYPTION_KEY error:&error]);
  XCTAssertNil(error);
  XCTAssertFalse([VaultManagerModule isStorageEncryptionKeyExist]);
  
  // should generate new encryption key and store in the keychain
  [performanceLogger start:@"GET_STORAGE_ENCRYPTION_KEY_GENERATE"];
  XCTAssertNotNil([VaultManagerModule getStorageEncryptionKey]);
  [performanceLogger end:@"GET_STORAGE_ENCRYPTION_KEY_GENERATE"];
  
  // should return true for storage encryption key exist
  XCTAssertTrue([VaultManagerModule isStorageEncryptionKeyExist]);
  
  // get newly generated encryption from keychain
  NSDictionary *item = [Keychain getItem:STORAGE_ENCRYPTION_KEY error:&error];
  XCTAssertNil(error);
  NSString *storageEncryptionKey = item[@"data"];
  // should not be null
  XCTAssertNotNil(storageEncryptionKey);
  // check newly generated key length be 64 bytes
  XCTAssertEqual(128, [storageEncryptionKey length]);
  // running the same method again should resolve to same encryption key
  [performanceLogger start:@"GET_STORAGE_ENCRYPTION_KEY_FETCH"];
  XCTAssertTrue([storageEncryptionKey isEqualToString:[VaultManagerModule getStorageEncryptionKey]]);
  [performanceLogger end:@"GET_STORAGE_ENCRYPTION_KEY_FETCH"];
}

#pragma mark - Shared access group

// an item the way builds before the shared access group stored it: in the default access group
- (OSStatus)addLegacyItem:(NSString *)name account:(NSString *)account data:(NSString *)data {
  return SecItemAdd((__bridge CFDictionaryRef) @{
    (id)kSecClass: (id)kSecClassInternetPassword,
    (id)kSecAttrServer: name,
    (id)kSecAttrAccount: account,
    (id)kSecValueData: [data dataUsingEncoding:NSUTF8StringEncoding],
    (id)kSecAttrAccessible: (id)kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
  }, NULL);
}

// access groups of every stored item with this name
- (NSArray<NSString *> *)accessGroupsOf:(NSString *)name {
  CFTypeRef found = NULL;
  OSStatus osStatus = SecItemCopyMatching((__bridge CFDictionaryRef) @{
    (id)kSecClass: (id)kSecClassInternetPassword,
    (id)kSecAttrServer: name,
    (id)kSecMatchLimit: (id)kSecMatchLimitAll,
    (id)kSecReturnAttributes: (id)kCFBooleanTrue,
  }, &found);

  if (osStatus != noErr || found == NULL) {
    return @[];
  }

  NSMutableArray *groups = [NSMutableArray array];
  for (NSDictionary *item in (NSArray *) CFBridgingRelease(found)) {
    [groups addObject:item[(id)kSecAttrAccessGroup] ?: @""];
  }
  return groups;
}

- (void)testSharedAccessGroupNewItems {
  NSError *error;
  NSString *name = @"VAULT_TEST_SHARED_NEW";
  XCTAssertTrue([Keychain deleteItem:name error:&error]);

  // new items go to the shared access group right away
  XCTAssertTrue([Keychain setItem:name account:@"ACCOUNT" data:@"DATA" error:&error]);
  XCTAssertNil(error);
  XCTAssertEqualObjects([self accessGroupsOf:name], @[XamanKeychainSharedGroup]);

  XCTAssertTrue([Keychain deleteItem:name error:&error]);
  XCTAssertEqual([[self accessGroupsOf:name] count], 0);
}

// the device id is a generic password, moved by account and service
- (void)testSharedAccessGroupMovesGenericPassword {
  NSString *key = @"VAULT_TEST_SHARED_GENERIC";
  NSDictionary *match = @{ (id)kSecAttrAccount: key, (id)kSecAttrService: key };
  NSMutableDictionary *query = [match mutableCopy];
  query[(id)kSecClass] = (id)kSecClassGenericPassword;
  SecItemDelete((__bridge CFDictionaryRef) query);

  NSMutableDictionary *legacy = [query mutableCopy];
  legacy[(id)kSecAttrAccessible] = (id)kSecAttrAccessibleAfterFirstUnlock;
  legacy[(id)kSecValueData] = [@"DEVICE" dataUsingEncoding:NSUTF8StringEncoding];
  XCTAssertEqual(SecItemAdd((__bridge CFDictionaryRef) legacy, NULL), noErr);

  XCTAssertTrue([Keychain moveItemsToSharedGroup:(__bridge id)kSecClassGenericPassword matching:match]);

  NSMutableDictionary *read = [query mutableCopy];
  read[(id)kSecReturnAttributes] = (id)kCFBooleanTrue;
  read[(id)kSecReturnData] = (id)kCFBooleanTrue;
  CFTypeRef found = NULL;
  XCTAssertEqual(SecItemCopyMatching((__bridge CFDictionaryRef) read, &found), noErr);
  NSDictionary *item = CFBridgingRelease(found);
  XCTAssertEqualObjects(item[(id)kSecAttrAccessGroup], XamanKeychainSharedGroup);
  XCTAssertEqualObjects(item[(id)kSecValueData], [@"DEVICE" dataUsingEncoding:NSUTF8StringEncoding]);
  XCTAssertEqualObjects(item[(id)kSecAttrAccessible], (id)kSecAttrAccessibleAfterFirstUnlock);

  XCTAssertEqual(SecItemDelete((__bridge CFDictionaryRef) query), noErr);
}

- (void)testSharedAccessGroupMovesExistingItem {
  NSError *error;
  NSString *name = @"VAULT_TEST_SHARED_MOVE";
  XCTAssertTrue([Keychain deleteItem:name error:&error]);

  XCTAssertEqual([self addLegacyItem:name account:@"ACCOUNT" data:@"DATA"], noErr);
  // stored outside the shared access group
  NSArray *before = [self accessGroupsOf:name];
  XCTAssertEqual([before count], 1);
  XCTAssertNotEqualObjects(before[0], XamanKeychainSharedGroup);

  // any keychain call moves it, with the same content
  XCTAssertTrue([Keychain itemExist:name error:&error]);
  XCTAssertNil(error);
  XCTAssertEqualObjects([self accessGroupsOf:name], @[XamanKeychainSharedGroup]);

  NSDictionary *item = [Keychain getItem:name error:&error];
  XCTAssertNil(error);
  XCTAssertEqualObjects(item[@"account"], @"ACCOUNT");
  XCTAssertEqualObjects(item[@"data"], @"DATA");

  // running it again changes nothing
  XCTAssertTrue([Keychain moveItemsToSharedGroup:(__bridge id)kSecClassInternetPassword
                                        matching:@{ (id)kSecAttrServer: name }]);
  XCTAssertEqualObjects([self accessGroupsOf:name], @[XamanKeychainSharedGroup]);
  XCTAssertEqualObjects([Keychain getItem:name error:&error][@"data"], @"DATA");

  XCTAssertTrue([Keychain deleteItem:name error:&error]);
  XCTAssertEqual([[self accessGroupsOf:name] count], 0);
}

// what Settings > Advanced and the session log show: access groups with item counts
- (void)testSharedAccessGroupInfo {
  NSError *error;
  NSString *name = @"VAULT_TEST_SHARED_INFO";
  XCTAssertTrue([Keychain deleteItem:name error:&error]);

  NSInteger movedBefore = [[Keychain sharedGroupInfo][@"moved"] integerValue];
  NSInteger sharedBefore = [[Keychain sharedGroupInfo][@"groups"][XamanKeychainSharedGroup] integerValue];

  XCTAssertEqual([self addLegacyItem:name account:@"ACCOUNT" data:@"DATA"], noErr);
  NSString *legacyGroup = [self accessGroupsOf:name][0];

  NSDictionary *info = [Keychain sharedGroupInfo];
  XCTAssertEqualObjects(info[@"sharedGroup"], XamanKeychainSharedGroup);
  XCTAssertEqual([info[@"moved"] integerValue], movedBefore + 1);
  XCTAssertEqual([info[@"groups"][XamanKeychainSharedGroup] integerValue], sharedBefore + 1);
  XCTAssertNil(info[@"groups"][legacyGroup]);
  XCTAssertEqual([info[@"lastError"] intValue], noErr);

  // nothing but group names and numbers
  NSString *text = [info description];
  XCTAssertFalse([text containsString:name]);
  XCTAssertFalse([text containsString:@"DATA"]);

  XCTAssertTrue([Keychain deleteItem:name error:&error]);
  XCTAssertEqual([[Keychain sharedGroupInfo][@"groups"][XamanKeychainSharedGroup] integerValue], sharedBefore);
}

- (void)testSharedAccessGroupMovesExistingVault {
  NSError *error;
  NSString *name = @"VAULT_TEST_SHARED_VAULT";
  XCTAssertTrue([Keychain deleteItem:name error:&error]);

  // create a vault, then put it back the way an older build stored it
  XCTAssertTrue([VaultManagerModule createVault:name data:VAULT_DATA key:VAULT_KEY]);
  NSDictionary *stored = [Keychain getItem:name error:&error];
  XCTAssertNotNil(stored);
  XCTAssertTrue([Keychain deleteItem:name error:&error]);
  XCTAssertEqual([self addLegacyItem:name account:stored[@"account"] data:stored[@"data"]], noErr);
  XCTAssertNotEqualObjects([self accessGroupsOf:name], @[XamanKeychainSharedGroup]);

  // opens with the same key, and is in the shared access group afterwards
  XCTAssertTrue([VaultManagerModule vaultExist:name]);
  XCTAssertTrue([VAULT_DATA isEqualToString:[VaultManagerModule openVault:name key:VAULT_KEY recoverable:NO]]);
  XCTAssertEqualObjects([self accessGroupsOf:name], @[XamanKeychainSharedGroup]);

  NSDictionary *moved = [Keychain getItem:name error:&error];
  XCTAssertEqualObjects(moved[@"account"], stored[@"account"]);
  XCTAssertEqualObjects(moved[@"data"], stored[@"data"]);

  XCTAssertTrue([VaultManagerModule purgeVault:name]);
  XCTAssertFalse([VaultManagerModule vaultExist:name]);
}

- (void)testSharedAccessGroupDuplicate {
  NSError *error;
  NSString *name = @"VAULT_TEST_SHARED_DUPLICATE";
  XCTAssertTrue([Keychain deleteItem:name error:&error]);

  // the same name in both access groups (an older build ran after the move)
  XCTAssertTrue([Keychain setItem:name account:@"ACCOUNT" data:@"SHARED" error:&error]);
  XCTAssertEqual([self addLegacyItem:name account:@"ACCOUNT" data:@"LEGACY"], noErr);
  XCTAssertEqual([[self accessGroupsOf:name] count], 2);

  // the shared one is used, the other one is left alone
  XCTAssertEqualObjects([Keychain getItem:name error:&error][@"data"], @"SHARED");
  XCTAssertNil(error);
  XCTAssertEqual([[self accessGroupsOf:name] count], 2);

  // delete removes both
  XCTAssertTrue([Keychain deleteItem:name error:&error]);
  XCTAssertEqual([[self accessGroupsOf:name] count], 0);
  XCTAssertNil([Keychain getItem:name error:&error]);
}

@end
