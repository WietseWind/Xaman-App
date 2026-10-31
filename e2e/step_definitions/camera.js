const { Given } = require('@cucumber/cucumber');
const { device } = require('detox');

Given('I verify the camera permission flow {string}', { timeout: 240000 }, async (caseName) => {
    const helper = device.getPlatform() === 'android'
        ? require('../helpers/cameraPermissions.android')
        : require('../helpers/cameraPermissions.ios');
    await helper.runCameraPermissionCase(caseName);
});
