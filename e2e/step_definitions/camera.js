const { Given } = require('@cucumber/cucumber');
const { device } = require('detox');
const { getCurrentTestPasscode } = require('../helpers/testCredentials');

Given('I verify the camera permission flow {string}', { timeout: 240000 }, async (caseName) => {
    if (process.env.E2E_IOS_DEVICE) {
        // A physical iPhone: iOS has no way to take back the camera answer of one app from outside
        // the phone (a simulator has `simctl privacy`), so these cases can not start from "never asked".
        return 'skipped';
    }
    const helper = device.getPlatform() === 'android'
        ? require('../helpers/cameraPermissions.android')
        : require('../helpers/cameraPermissions.ios');
    await helper.runCameraPermissionCase(caseName, { passcode: getCurrentTestPasscode() });
    return undefined;
});
