#import <React/RCTView.h>
#import <React/RCTViewManager.h>

/*
 Container that covers its content while the screen is being captured: screen recording,
 AirPlay or cable mirroring, screen sharing in a call. Used around views that show or
 accept account secrets. The cover is added natively, so the content never reaches a
 captured frame while React is still catching up.
 (Screenshots can't be detected in advance on iOS and are not covered by this.)
 */
@interface CaptureShieldView : RCTView

@property (nonatomic, assign) BOOL enabled;
@property (nonatomic, copy) NSString *coverText;
@property (nonatomic, strong) UIColor *coverColor;
@property (nonatomic, strong) UIColor *coverTextColor;

// YES while the cover is on top of the content
@property (nonatomic, readonly) BOOL isCovered;

// whether the screen this view is on is being captured
- (BOOL)isScreenCaptured;
- (void)updateCover;

@end

@interface CaptureShieldViewManager : RCTViewManager

@end
