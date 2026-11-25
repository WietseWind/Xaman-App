/**
 * Loaded first by cucumber, and only for a run on a physical iPhone (the runner adds
 * `--require ./e2e/iosDevice/register.js` when it got `--device UDID`).
 *
 * From here on `require('detox')` and `require('detox/internals')` give ./detox.js, which sends the
 * same calls to WebDriverAgent on the phone. Nothing else in the suite changes for it; a simulator
 * or Android run never loads this file and uses Detox itself.
 */
const Module = require('module');

if (!process.env.E2E_IOS_DEVICE) {
    throw new Error('e2e/iosDevice/register.js is for a run on a physical iPhone: E2E_IOS_DEVICE is not set');
}

// eslint-disable-next-line global-require
const facade = require('./detox');

const load = Module._load;
Module._load = function loadWithIphone(request, ...rest) {
    if (request === 'detox') {
        return facade;
    }
    if (request === 'detox/internals') {
        return facade.internals;
    }
    return load.call(this, request, ...rest);
};
