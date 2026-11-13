//
//  CaptureShieldViewTest.m
//  XamanTests
//

#import <XCTest/XCTest.h>

#import "../Xaman/Libs/UI/CaptureShieldView/CaptureShieldViewManager.h"

// the simulator can't start a real capture, so the state is set by the test
@interface TestCaptureShieldView : CaptureShieldView
@property (nonatomic, assign) BOOL captured;
@end

@implementation TestCaptureShieldView
- (BOOL)isScreenCaptured {
  return _captured;
}
@end

@interface CaptureShieldViewTest : XCTestCase
@end

@implementation CaptureShieldViewTest {
  UIWindow *_window;
  TestCaptureShieldView *_shield;
  UITextField *_input;
}

- (void)setUp {
  _window = [[UIWindow alloc] initWithFrame:CGRectMake(0, 0, 320, 480)];
  _window.rootViewController = [UIViewController new];
  _window.hidden = NO;

  _shield = [[TestCaptureShieldView alloc] initWithFrame:CGRectMake(0, 100, 320, 60)];
  _shield.coverText = @"HIDDEN";
  _input = [[UITextField alloc] initWithFrame:_shield.bounds];
  [_shield addSubview:_input];
  [_window.rootViewController.view addSubview:_shield];
}

- (void)tearDown {
  [_shield removeFromSuperview];
  _window.hidden = YES;
  _window = nil;
}

- (void)setCaptured:(BOOL)captured {
  _shield.captured = captured;
  [[NSNotificationCenter defaultCenter] postNotificationName:UIScreenCapturedDidChangeNotification object:nil];
}

- (void)testNotCoveredWithoutCapture {
  XCTAssertFalse(_shield.isCovered);
  XCTAssertEqual([_shield hitTest:CGPointMake(10, 10) withEvent:nil], _input);
}

- (void)testCoveredWhileCaptured {
  [self setCaptured:YES];
  XCTAssertTrue(_shield.isCovered);

  // the cover is the top view, as large as the shield, opaque, and takes the touches
  UIView *cover = _shield.subviews.lastObject;
  XCTAssertNotEqual(cover, _input);
  XCTAssertTrue(CGRectEqualToRect(cover.frame, _shield.bounds));
  XCTAssertTrue(cover.opaque);
  XCTAssertNotNil(cover.backgroundColor);
  XCTAssertEqual(cover.alpha, 1.0);
  XCTAssertNotEqual([_shield hitTest:CGPointMake(10, 10) withEvent:nil], _input);
  XCTAssertEqualObjects(cover.accessibilityLabel, @"HIDDEN");
  XCTAssertEqualObjects(_shield.accessibilityElements, @[cover]);

  // content added later stays below the cover, also after a resize
  UIView *late = [[UIView alloc] initWithFrame:_shield.bounds];
  [_shield addSubview:late];
  _shield.frame = CGRectMake(0, 100, 300, 90);
  [_shield layoutIfNeeded];
  XCTAssertEqual(_shield.subviews.lastObject, cover);
  XCTAssertTrue(CGRectEqualToRect(cover.frame, _shield.bounds));

  // and it is gone when the capture ends
  [late removeFromSuperview];
  [self setCaptured:NO];
  XCTAssertFalse(_shield.isCovered);
  XCTAssertNil(_shield.accessibilityElements);
  XCTAssertEqual([_shield hitTest:CGPointMake(10, 10) withEvent:nil], _input);
}

- (void)testCoveredWhenShownDuringCapture {
  [_shield removeFromSuperview];
  _shield.captured = YES;
  XCTAssertFalse(_shield.isCovered);
  [_window.rootViewController.view addSubview:_shield];
  XCTAssertTrue(_shield.isCovered);
}

- (void)testDisabled {
  _shield.enabled = NO;
  [self setCaptured:YES];
  XCTAssertFalse(_shield.isCovered);
  _shield.enabled = YES;
  XCTAssertTrue(_shield.isCovered);
}

- (void)testKeyboardClosesWhenCaptureStarts {
  [_window makeKeyAndVisible];
  XCTAssertTrue([_input becomeFirstResponder]);
  [self setCaptured:YES];
  XCTAssertFalse(_input.isFirstResponder);

  // no typing behind the cover
  [_input becomeFirstResponder];
  XCTestExpectation *resigned = [self expectationWithDescription:@"input gives up focus"];
  dispatch_async(dispatch_get_main_queue(), ^{
    dispatch_async(dispatch_get_main_queue(), ^{
      [resigned fulfill];
    });
  });
  [self waitForExpectations:@[resigned] timeout:2];
  XCTAssertFalse(_input.isFirstResponder);
}

@end
