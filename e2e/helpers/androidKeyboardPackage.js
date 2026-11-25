// Which nodes of a UI dump belong to the on-screen keyboard.
//
// The emulator has Gboard (com.google.android.inputmethod.latin). A phone can have another keyboard, with a
// package name that says nothing (Samsung: com.samsung.android.honeyboard). So next to the name, the package
// of the keyboard that is set on the device counts (tapById.js reads it once from the device settings).
let current = '';

const setKeyboardPackage = (pkg) => {
    current = String(pkg || '').trim();
};

const isKeyboardPackage = (pkg) => !!pkg && (/inputmethod/i.test(pkg) || (current !== '' && pkg === current));

module.exports = { setKeyboardPackage, isKeyboardPackage, keyboardPackage: () => current };
