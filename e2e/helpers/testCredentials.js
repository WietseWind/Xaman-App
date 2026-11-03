// Shared by setup, passcode changes and later permission/lock recovery tests.
let currentPasscode = process.env.E2E_PASSCODE || '167349';

const getCurrentTestPasscode = () => currentPasscode;

const setCurrentTestPasscode = (value) => {
    if (!/^\d{6}$/.test(value)) throw new Error('The test passcode must have six digits');
    currentPasscode = value;
};

module.exports = { getCurrentTestPasscode, setCurrentTestPasscode };
