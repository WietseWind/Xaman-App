#import <Foundation/Foundation.h>

// Keychain access group that comes from the app group. Unlike the default access group
// (<Team ID>.<bundle id>) it has no Apple Team ID in it, so the items stay readable if
// the app ever moves to another developer team.
extern NSString * const XamanKeychainSharedGroup;

@interface Keychain : NSObject
+ (NSDictionary *)getItem:(NSString *)name error:(NSError **)error;
// every item with this name ({ name, account, data }), the ones in the shared access group first;
// more than one only after a build without the app group stored its own (see Keychain.m)
+ (NSArray<NSDictionary *> *)getItems:(NSString *)name error:(NSError **)error;
// rename the item in the shared access group that has the same name as one outside it (never deletes);
// only once the item outside it is proven to be the one in use. YES when no such twin is left.
+ (BOOL)setAsideSharedItem:(id)secClass
                  matching:(NSDictionary *)match
                  renaming:(id)attribute
          ifOutsideValueIs:(NSString *)expected;
+ (BOOL)deleteItem:(NSString *)name error:(NSError **)error;
+ (BOOL)setItem:(NSString *)name account:(NSString *)account data:(NSString *)data error:(NSError **)error;
+ (BOOL)itemExist:(NSString *)name error:(NSError **)error;
+ (void)clear;
// add an item to the shared access group (default access group if the build lacks the app group)
+ (OSStatus)addItem:(NSDictionary *)attributes;
// move matching items of one class to the shared access group; returns YES once all are there
+ (BOOL)moveItemsToSharedGroup:(id)secClass matching:(NSDictionary *)match;
// where the app's keychain items are: { sharedGroup, groups: { access group: item count }, moved, lastError }
// (moved = items this process moved, lastError = OSStatus of the last failed move, 0 if none)
+ (NSDictionary *)sharedGroupInfo;
@end
