#import "OtaRecovery.h"
#import "Xaman-Swift.h"

// Device-side safety net for over-the-air updates, see XamanOta.swift.
@implementation OtaRecoveryModule

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

// The running bundle reached a usable screen: reset the launch watchdog.
RCT_EXPORT_METHOD(markHealthy)
{
  [XamanOta markHealthy];
}

// Revert to the store version on the next launch, and never accept `updateId` (or update `otaId`) again.
RCT_EXPORT_METHOD(scheduleRevert:(NSString *)updateId otaId:(nonnull NSNumber *)otaId resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  [XamanOta scheduleRevert:updateId otaId:otaId.integerValue];
  resolve(@YES);
}

RCT_EXPORT_METHOD(getState:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  NSString *reverted = [XamanOta takeRevertedUpdateId];
  resolve(@{
    @"blockedUpdateIds" : [XamanOta blockedUpdateIds],
    @"blockedOtaIds" : [XamanOta blockedOtaIds],
    @"revertedUpdateId" : reverted ?: [NSNull null],
    @"revertPending" : @([XamanOta isRevertPending]),
    @"unhealthyLaunches" : @([XamanOta unhealthyLaunches]),
    @"watchdogLimit" : @([XamanOta watchdogLimit]),
    @"automatedTest" : @([XamanOta isAutomatedTest]),
  });
}

@end
