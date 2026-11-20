/**
 * Test IDs that a physical iPhone does not show on their own.
 *
 * WebDriverAgent sees the accessibility tree. Where the app makes one accessible element of a
 * group (a button with its texts, a token row, a row of a list), the test IDs of the views inside
 * it are not in that tree; the group carries their text in its label. Detox on a simulator sees
 * every view, so the steps name the inner ID. On a phone the inner ID is looked up first and, when
 * it is not there, the group below stands in for it; `text` takes the inner text out of the
 * group's label.
 */
const ADDRESS = /r[1-9A-HJ-NP-Za-km-z]{24,34}/;

const FIXED = {
    // home: the balance is part of the native token row ("XAH 99 Reserved 1")
    'account-native-balance': { id: 'token-native', text: (label) => (/^\S+\s+(\S+)/.exec(label) || [])[1] || '' },
    // home: the address is part of the account button ("G-Passcode-1 r4eKNk…")
    'account-address-text': { id: 'account-switch-button', text: (label) => (ADDRESS.exec(label) || [''])[0] },
    // import, family seed: the curve is part of its row ("Keypair curve secp256k1")
    'keypair-curve-value': { id: 'keypair-curve-row', text: (label) => label.split(' ').pop() },
};

const PATTERNS = [
    // Settings > Accounts: the account is the row of the list
    [/^account-(r[1-9A-HJ-NP-Za-km-z]{24,34})$/, (match) => ({ id: `account-list-scroll-row-${match[1]}` })],
    // review: the account to sign with is the picker button ("MS-A rfJuniz…")
    [
        /^account-picker-selected-(r[1-9A-HJ-NP-Za-km-z]{24,34})$/,
        (match) => ({ predicate: `name == "account-picker" AND label CONTAINS "${match[1]}"` }),
    ],
    // home: a token ("<issuer>.<currency>") is its row in the list ("token-<account>.network.<id>.<issuer>.<currency>")
    [
        /^r[1-9A-HJ-NP-Za-km-z]{24,34}\.[A-Za-z0-9]{3,40}$/,
        (match) => ({ predicate: `name BEGINSWITH "token-" AND name ENDSWITH ".${match[0]}"` }),
    ],
];

const aliasFor = (id) => {
    if (FIXED[id]) {
        return FIXED[id];
    }
    for (const [pattern, alias] of PATTERNS) {
        const match = pattern.exec(id);
        if (match) {
            return alias(match);
        }
    }
    return null;
};

module.exports = aliasFor;
