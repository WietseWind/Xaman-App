const { device } = require('detox');

// The adb serial of the device Detox drives. ANDROID_SERIAL may name it (preflight checks it is
// the Detox device), but there is no hard-coded fallback: adb commands must never go to another
// emulator or a phone that happens to be connected.
const androidSerial = () => {
    let serial = process.env.ANDROID_SERIAL;
    if (!serial) {
        try {
            serial = device.id;
        } catch (e) {
            // Detox not initialised yet
        }
    }
    if (!serial) {
        throw new Error('e2e: no Android device yet (set ANDROID_SERIAL, or call this after detox.init)');
    }
    return serial;
};

module.exports = { androidSerial };
