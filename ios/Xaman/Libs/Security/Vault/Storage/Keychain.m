//
//  Keychain.m
//  Keychain
//
//  Created by Joel Arvidsson on 2015-05-20.
//  Copyright (c) 2015 Joel Arvidsson. All rights reserved.
//

#import "keychain.h"

#import <Security/Security.h>
#import <React/RCTConvert.h>

NSString * const XamanKeychainSharedGroup = @"group.app.xaman";

// Where the items of each class were after the last look (class -> access group -> count),
// the last move error of each class, and how many items this process moved.
// Shown in Settings > Advanced (developer mode) and written to the session log:
// access group names and counts only, never an item's name or data.
static NSMutableDictionary<NSString *, NSDictionary<NSString *, NSNumber *> *> *groupsByClass;
static NSMutableDictionary<NSString *, NSNumber *> *moveErrorByClass;
static NSInteger movedItems = 0;

@implementation Keychain

#pragma mark - Shared access group

+ (void)noteGroups:(NSDictionary<NSString *, NSNumber *> *)groups
          forClass:(id)secClass
             moved:(NSInteger)moved
             error:(OSStatus)error
{
  @synchronized (self) {
    if (groupsByClass == nil) {
      groupsByClass = [NSMutableDictionary dictionary];
      moveErrorByClass = [NSMutableDictionary dictionary];
    }

    if (groups != nil) {
      groupsByClass[secClass] = groups;
    }

    moveErrorByClass[secClass] = error == noErr ? nil : @(error);
    movedItems += moved;
  }
}

+ (NSDictionary *)sharedGroupInfo
{
  // look again, so the answer is current
  [self moveVaultsToSharedGroup];

  @synchronized (self) {
    NSMutableDictionary<NSString *, NSNumber *> *groups = [NSMutableDictionary dictionary];

    for (NSDictionary<NSString *, NSNumber *> *ofClass in [groupsByClass allValues]) {
      for (NSString *group in ofClass) {
        groups[group] = @([groups[group] integerValue] + [ofClass[group] integerValue]);
      }
    }

    return @{
      @"sharedGroup": XamanKeychainSharedGroup,
      @"groups": groups,
      @"moved": @(movedItems),
      @"lastError": [[moveErrorByClass allValues] firstObject] ?: @(noErr),
    };
  }
}

/*
 Add an item to the shared access group.
 A build that is signed without the app group can't use that group, so fall back to the
 default access group: storing must keep working in any build.
 */
+ (OSStatus)addItem:(NSDictionary *)attributes
{
  NSMutableDictionary *shared = [attributes mutableCopy];
  shared[(id)kSecAttrAccessGroup] = XamanKeychainSharedGroup;

  OSStatus osStatus = SecItemAdd((__bridge CFDictionaryRef) shared, NULL);

  if (osStatus != noErr && osStatus != errSecDuplicateItem) {
    osStatus = SecItemAdd((__bridge CFDictionaryRef) attributes, NULL);
  }

  return osStatus;
}

/*
 Move the matching items of one class from any other access group to the shared one.
 SecItemUpdate only changes the access group attribute: the stored data is not read,
 rewritten or re-encrypted, and an item that can't be moved stays where it is.
 Nothing is ever deleted here, and reads look in every access group of the app,
 so a move that fails (device locked, build without the app group) is retried later.
 */
+ (BOOL)moveItemsToSharedGroup:(id)secClass matching:(NSDictionary *)match
{
  NSMutableDictionary *query = [NSMutableDictionary dictionaryWithDictionary:match ?: @{}];
  query[(id)kSecClass] = secClass;
  query[(id)kSecMatchLimit] = (id)kSecMatchLimitAll;
  query[(id)kSecReturnAttributes] = (id)kCFBooleanTrue;

  CFTypeRef found = NULL;
  OSStatus osStatus = SecItemCopyMatching((__bridge CFDictionaryRef) query, &found);

  if (osStatus != noErr || found == NULL) {
    // no items is a result (nothing stored yet); anything else (device locked) leaves the last result
    BOOL none = osStatus == errSecItemNotFound;
    [self noteGroups:(none ? @{} : nil) forClass:secClass moved:0 error:(none ? noErr : osStatus)];
    return NO;
  }

  NSArray *items = CFBridgingRelease(found);

  if (![items isKindOfClass:[NSArray class]] || [items count] == 0) {
    [self noteGroups:@{} forClass:secClass moved:0 error:noErr];
    return NO;
  }

  // the attributes our own items are stored with
  NSArray *identifiers = @[(id)kSecAttrServer, (id)kSecAttrService, (id)kSecAttrAccount];
  BOOL settled = YES;
  NSCountedSet<NSString *> *groups = [NSCountedSet set];
  NSInteger moved = 0;
  OSStatus moveError = noErr;

  for (NSDictionary *item in items) {
    NSString *group = item[(id)kSecAttrAccessGroup];

    if (![group isKindOfClass:[NSString class]]) {
      settled = NO;
      [groups addObject:@"unknown"];
      continue;
    }

    if ([group isEqualToString:XamanKeychainSharedGroup]) {
      [groups addObject:group];
      continue;
    }

    NSMutableDictionary *target = [NSMutableDictionary dictionary];
    target[(id)kSecClass] = secClass;
    target[(id)kSecAttrAccessGroup] = group;

    for (id identifier in identifiers) {
      if (item[identifier] != nil) {
        target[identifier] = item[identifier];
      }
    }

    NSDictionary *update = @{ (id)kSecAttrAccessGroup: XamanKeychainSharedGroup };

    OSStatus updateStatus = SecItemUpdate((__bridge CFDictionaryRef) target, (__bridge CFDictionaryRef) update);

    if (updateStatus == noErr) {
      moved += 1;
      [groups addObject:XamanKeychainSharedGroup];
    } else {
      settled = NO;
      moveError = updateStatus;
      [groups addObject:group];
    }
  }

  NSMutableDictionary<NSString *, NSNumber *> *counts = [NSMutableDictionary dictionary];
  for (NSString *group in groups) {
    counts[group] = @([groups countForObject:group]);
  }
  [self noteGroups:counts forClass:secClass moved:moved error:moveError];

  return settled;
}

/*
 Vaults and the storage encryption key: checked before every keychain call, so the move
 needs no stored state and a failed attempt is retried by itself.
 */
+ (void)moveVaultsToSharedGroup
{
  [self moveItemsToSharedGroup:(__bridge id)kSecClassInternetPassword matching:nil];
}

#pragma mark - Items

+ (BOOL)deleteItem:(NSString *)name error:(NSError **)error
{
  [self moveVaultsToSharedGroup];

  NSDictionary *query = @{
    (__bridge NSString *)kSecClass: (__bridge id)(kSecClassInternetPassword),
    (__bridge NSString *)kSecAttrServer: name,
    (__bridge NSString *)kSecReturnAttributes: (__bridge id)kCFBooleanTrue,
    (__bridge NSString *)kSecReturnData: (__bridge id)kCFBooleanFalse
  };
  
  OSStatus osStatus =  SecItemDelete((__bridge CFDictionaryRef) query);
  
  if (osStatus != noErr && osStatus != errSecItemNotFound) {
    *error = [NSError errorWithDomain:NSOSStatusErrorDomain code:osStatus userInfo:nil];
    return NO;
  }
  
  return YES;
}

+ (BOOL)setItem:(NSString *)name
        account:(NSString*)account
           data:(NSString*)data
          error:(NSError **)error
{
  [self moveVaultsToSharedGroup];

  NSDictionary *attributes =
  @{
    (id)kSecClass: (id)kSecClassInternetPassword,
    (id)kSecAttrServer: name,
    (id)kSecAttrAccount: account,
    (id)kSecValueData: [data dataUsingEncoding:NSUTF8StringEncoding],
    (id)kSecAttrAccessible: (id)kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
  };
  
  OSStatus osStatus = [self addItem:attributes];
  
  if (osStatus != noErr && osStatus != errSecItemNotFound) {
    *error = [NSError errorWithDomain:NSOSStatusErrorDomain code:osStatus userInfo:nil];
    return NO;
  }
  
  return YES;
}

+ (BOOL)itemExist:(NSString *)name
            error:(NSError **)error
{
  [self moveVaultsToSharedGroup];

  NSDictionary *query =
  @{
    (id)kSecClass: (id)kSecClassInternetPassword,
    (id)kSecAttrServer: name,
    (id)kSecMatchLimit: (id)kSecMatchLimitOne,
    (id)kSecUseAuthenticationUI:(id)kSecUseAuthenticationUIFail
  };
  
  OSStatus osStatus = SecItemCopyMatching((__bridge CFDictionaryRef) query, nil);
  
  switch (osStatus) {
    case noErr:
    case errSecInteractionNotAllowed:
      return YES;
    case errSecItemNotFound:
      return NO;
  }
  
  *error = [NSError errorWithDomain:NSOSStatusErrorDomain code:osStatus userInfo:nil];
  return NO;
}


+ (NSDictionary *)getItem:(NSString *)name
                error:(NSError **)error
{
  [self moveVaultsToSharedGroup];

  NSDictionary *query = @{
    (__bridge NSString *)kSecClass: (__bridge id)(kSecClassInternetPassword),
    (__bridge NSString *)kSecAttrServer: name,
    (__bridge NSString *)kSecReturnAttributes: (__bridge id)kCFBooleanTrue,
    (__bridge NSString *)kSecReturnData: (__bridge id)kCFBooleanTrue,
    (__bridge NSString *)kSecMatchLimit: (__bridge NSString *)kSecMatchLimitOne
  };
  
  
  // check item is exist before returning the data
  NSDictionary *item = nil;
  CFTypeRef itemTypeRef = NULL;

  // the item in the shared access group wins; any other access group is only a fallback
  NSMutableDictionary *sharedQuery = [query mutableCopy];
  sharedQuery[(id)kSecAttrAccessGroup] = XamanKeychainSharedGroup;

  OSStatus osStatus = SecItemCopyMatching((__bridge CFDictionaryRef) sharedQuery, (CFTypeRef*)&itemTypeRef);

  if (osStatus != noErr || itemTypeRef == NULL) {
    itemTypeRef = NULL;
    osStatus = SecItemCopyMatching((__bridge CFDictionaryRef) query, (CFTypeRef*)&itemTypeRef);
  }
  
  if (osStatus != noErr && osStatus != errSecItemNotFound) {
    *error = [NSError errorWithDomain:NSOSStatusErrorDomain code:osStatus userInfo:nil];
    return nil;
  }
  
  item = (__bridge NSDictionary*)(itemTypeRef);
  if (!item) {
    return nil;
  }
  
  NSString *account = (NSString *) [item objectForKey:(__bridge id)(kSecAttrAccount)];
  NSString *data = [[NSString alloc] initWithData:[item objectForKey:(__bridge id)(kSecValueData)] encoding:NSUTF8StringEncoding];
  
  CFRelease(itemTypeRef);
  
  return @{
    @"name": name,
    @"account": account,
    @"data": data,
  };
}

+ (void)clear
{
  NSArray *secItemClasses = @[(__bridge id)kSecClassInternetPassword,
                                 (__bridge id)kSecAttrGeneric,
                                 (__bridge id)kSecAttrAccount,
                                 (__bridge id)kSecClassKey,
                                 (__bridge id)kSecAttrService];
     for (id secItemClass in secItemClasses) {
         NSDictionary *spec = @{(__bridge id)kSecClass: secItemClass};
         SecItemDelete((__bridge CFDictionaryRef)spec);
     }
}

@end
