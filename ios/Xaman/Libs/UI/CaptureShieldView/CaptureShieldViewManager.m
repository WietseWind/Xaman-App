#import "CaptureShieldViewManager.h"

@implementation CaptureShieldView {
  UIView *_cover;
  UILabel *_label;
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    _enabled = YES;

    NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
    [center addObserver:self
               selector:@selector(captureDidChange)
                   name:UIScreenCapturedDidChangeNotification
                 object:nil];
    [center addObserver:self
               selector:@selector(editingDidBegin:)
                   name:UITextFieldTextDidBeginEditingNotification
                 object:nil];
    [center addObserver:self
               selector:@selector(editingDidBegin:)
                   name:UITextViewTextDidBeginEditingNotification
                 object:nil];
  }
  return self;
}

- (void)dealloc
{
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

#pragma mark - Capture state

- (BOOL)isScreenCaptured
{
  UIScreen *screen = self.window.screen ?: UIScreen.mainScreen;

  if (screen.isCaptured) {
    return YES;
  }

  if (@available(iOS 17.0, *)) {
    return self.traitCollection.sceneCaptureState == UISceneCaptureStateActive;
  }

  return NO;
}

- (BOOL)isCovered
{
  return _cover != nil && _cover.superview == self;
}

- (void)captureDidChange
{
  if ([NSThread isMainThread]) {
    [self updateCover];
    return;
  }

  dispatch_async(dispatch_get_main_queue(), ^{
    [self updateCover];
  });
}

// no typing behind the cover: the system keyboard is part of a recording
- (void)editingDidBegin:(NSNotification *)notification
{
  UIView *input = notification.object;

  if (![input isKindOfClass:[UIView class]]) {
    return;
  }

  dispatch_async(dispatch_get_main_queue(), ^{
    if ([self isCovered] && [input isDescendantOfView:self]) {
      [input resignFirstResponder];
    }
  });
}

#pragma mark - Cover

- (void)updateCover
{
  BOOL cover = _enabled && self.window != nil && [self isScreenCaptured];

  if (!cover) {
    if (_cover != nil) {
      [_cover removeFromSuperview];
      self.accessibilityElements = nil;
    }
    return;
  }

  if (_cover == nil) {
    _cover = [[UIView alloc] initWithFrame:self.bounds];
    _cover.opaque = YES;
    // takes every touch, so nothing below it can be used while it is covered
    _cover.userInteractionEnabled = YES;
    _cover.isAccessibilityElement = YES;
    _cover.accessibilityTraits = UIAccessibilityTraitStaticText;

    _label = [[UILabel alloc] initWithFrame:_cover.bounds];
    _label.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    _label.textAlignment = NSTextAlignmentCenter;
    _label.numberOfLines = 0;
    _label.font = [UIFont systemFontOfSize:15 weight:UIFontWeightSemibold];
    _label.adjustsFontSizeToFitWidth = YES;
    _label.minimumScaleFactor = 0.6;
    _label.isAccessibilityElement = NO;
    [_cover addSubview:_label];
  }

  _cover.backgroundColor = _coverColor ?: UIColor.systemBackgroundColor;
  _label.textColor = _coverTextColor ?: UIColor.labelColor;
  _label.text = _coverText;
  _cover.accessibilityLabel = _coverText;
  _cover.frame = self.bounds;
  _label.frame = CGRectInset(_cover.bounds, 8, 4);

  if (_cover.superview != self) {
    [self addSubview:_cover];
    // the screen reader gets the cover only, not the content below it
    self.accessibilityElements = @[_cover];
    [self endEditing:YES];
  }

  [self bringSubviewToFront:_cover];
}

#pragma mark - View

- (void)didMoveToWindow
{
  [super didMoveToWindow];
  [self updateCover];
}

- (void)layoutSubviews
{
  [super layoutSubviews];

  if ([self isCovered]) {
    _cover.frame = self.bounds;
    _label.frame = CGRectInset(_cover.bounds, 8, 4);
    [self bringSubviewToFront:_cover];
  }
}

- (void)didUpdateReactSubviews
{
  [super didUpdateReactSubviews];

  if ([self isCovered]) {
    [self bringSubviewToFront:_cover];
  }
}

- (void)traitCollectionDidChange:(UITraitCollection *)previousTraitCollection
{
  [super traitCollectionDidChange:previousTraitCollection];
  [self updateCover];
}

#pragma mark - Props

- (void)setEnabled:(BOOL)enabled
{
  _enabled = enabled;
  [self updateCover];
}

- (void)setCoverText:(NSString *)coverText
{
  _coverText = [coverText copy];
  [self updateCover];
}

- (void)setCoverColor:(UIColor *)coverColor
{
  _coverColor = coverColor;
  [self updateCover];
}

- (void)setCoverTextColor:(UIColor *)coverTextColor
{
  _coverTextColor = coverTextColor;
  [self updateCover];
}

@end

@implementation CaptureShieldViewManager

RCT_EXPORT_MODULE();

RCT_EXPORT_VIEW_PROPERTY(enabled, BOOL);
RCT_EXPORT_VIEW_PROPERTY(coverText, NSString);
RCT_EXPORT_VIEW_PROPERTY(coverColor, UIColor);
RCT_EXPORT_VIEW_PROPERTY(coverTextColor, UIColor);

- (UIView *)view
{
  return [[CaptureShieldView alloc] init];
}

@end
