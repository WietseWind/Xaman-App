// The connection to the node of the network: the app never gives up, and a review does not wait for it.
// The node is blocked on the emulator (see ../helpers/androidNodeBlock): the phone keeps its network.
const assert = require('assert');
const { execFileSync } = require('child_process');
const { Given, Then, After } = require('@cucumber/cucumber');
const { device } = require('detox');

const { androidSerial } = require('../helpers/androidSerial');
const {
    androidHasTestId,
    androidReadTextByTestId,
    clickAndroidTextIncludes,
    unlockAndroidPasscodeWhenItShows,
} = require('../helpers/tapById');
const { canBlockNodes, blockHost, unblockAll } = require('../helpers/androidNodeBlock');
const { FEE, createSignRequest, newAccount } = require('../helpers/signRequests');

const isAndroid = () => device.getPlatform() === 'android';
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// the node of the network the suite is connected to (Xahau Testnet)
const NODE_HOST = 'xahau-test.net';
// a URIToken that is not on the ledger: the card of the review has to look it up, and finds nothing
const NO_SUCH_URITOKEN = 'E2E0000000000000000000000000000000000000000000000000000000000533';

const state = { request: undefined };

// a scenario that failed half way must not leave the node blocked for the next one
After(async () => {
    unblockAll();
});

Given('this device can block the node of the network', async () => {
    if (!isAndroid() || !canBlockNodes()) {
        // an iPhone, a simulator, a phone on USB, or an emulator image without root
        return 'skipped';
    }
    return undefined;
});

Then('I block the node of the network', async () => {
    await blockHost(NODE_HOST);
});

// The user leaves the app for a while (after 15 seconds in the background the app closes its connection),
// the node can not be reached any more, and the user comes back: the app connects again, and every
// attempt fails. This is how a client gives up: failed attempts, not a connection that went silent.
Then('I leave the app, the node gets blocked, and I come back', { timeout: 3 * 60 * 1000 }, async () => {
    const adb = (...args) => execFileSync('adb', ['-s', androidSerial(), ...args], { timeout: 15000 });
    adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
    await sleep(22000);
    await blockHost(NODE_HOST);
    adb('shell', 'am', 'start', '-n', 'com.xrpllabs.xumm/.LaunchActivity');
    await unlockAndroidPasscodeWhenItShows();
});

Then('I unblock the node of the network', async () => {
    unblockAll();
});

// Home says "Connected: wss://…" or "Disconnected: wss://…" (the label for a screen reader has both parts)
const nodeConnection = async () => String((await androidReadTextByTestId('node-connection')) || '');

Given(
    'the node connection should say {string} within {int} sec',
    { timeout: 5 * 60 * 1000 },
    async (expected, seconds) => {
        const deadline = Date.now() + seconds * 1000;
        let last = '';
        while (Date.now() < deadline) {
            last = await nodeConnection();
            if (last.startsWith(`${expected}:`)) {
                return;
            }
            await sleep(1500);
        }
        throw new Error(`the node connection says "${last}", expected "${expected}" within ${seconds} s`);
    },
);

// It stays as it is for this long: read every few seconds, so a short "Connected" in between is seen
Given(
    'the node connection should stay {string} for {int} sec',
    { timeout: 5 * 60 * 1000 },
    async (expected, seconds) => {
        const deadline = Date.now() + seconds * 1000;
        while (Date.now() < deadline) {
            const now = await nodeConnection();
            // "Connecting" is the app that tries again; it must not get to "Connected"
            assert(!now.startsWith('Connected:'), `the node connection says "${now}" while the node is blocked`);
            await sleep(3000);
        }
        assert(expected === 'Disconnected', 'only "Disconnected" can be asked to stay');
    },
);

// "Looks like you're offline": the app says it once for a network
Then('I close the connection problem message if it shows', { timeout: 60 * 1000 }, async () => {
    for (let i = 0; i < 5; i += 1) {
        try {
            await clickAndroidTextIncludes('Close');
            await sleep(1000);
            return;
        } catch (e) {
            await sleep(1500);
        }
    }
});

/* A Remit review while the node can not be reached ================================================ */
// The request comes from the Xaman backend, which stays reachable. The account on Home pays; the request
// is only reviewed and then declined.
Then('I create a Remit sign request that needs the ledger for its review', { timeout: 2 * 60 * 1000 }, async () => {
    state.request = await createSignRequest(
        {
            TransactionType: 'Remit',
            Destination: newAccount().address,
            Fee: FEE,
            Amounts: [{ AmountEntry: { Amount: '1000000' } }],
            URITokenIDs: [NO_SUCH_URITOKEN],
        },
        { submit: false },
    );
});

Then('I open the sign request for the review', async () => {
    execFileSync(
        'adb',
        ['-s', androidSerial(), 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d',
            state.request.url, 'com.xrpllabs.xumm'],
        { timeout: 10000 },
    );
    // the intent brings the app to the front again, which can lock it a moment later
    await unlockAndroidPasscodeWhenItShows();
});

// The card has no answer from the ledger: after some seconds it shows the token ID, not a placeholder
Given('the URIToken card should show the token ID within {int} sec', { timeout: 3 * 60 * 1000 }, async (seconds) => {
    const deadline = Date.now() + seconds * 1000;
    let text = '';
    while (Date.now() < deadline) {
        text = String((await androidReadTextByTestId('remit-content-uritoken-0')) || '').replace(/\s/g, '');
        if (text.includes(NO_SUCH_URITOKEN)) {
            return;
        }
        await sleep(1000);
    }
    throw new Error(`the URIToken card does not show the token ID after ${seconds} s: "${text}"`);
});

const cautionHeader = async () => {
    if (await androidHasTestId('remit-pays-total')) {
        return { exact: true, text: String(await androidReadTextByTestId('remit-pays-total')) };
    }
    if (await androidHasTestId('remit-pays-total-at-most')) {
        return { exact: false, text: String(await androidReadTextByTestId('remit-pays-total-at-most')) };
    }
    return undefined;
};

// No answer from the ledger: the caution is there, with everything that can apply, as "up to"
Given('the Remit caution should say "up to", not an exact amount', { timeout: 2 * 60 * 1000 }, async () => {
    const header = await cautionHeader();
    assert(header, 'the Remit caution is not on screen');
    assert.strictEqual(header.exact, false, `the caution is exact while the node is blocked: "${header.text}"`);
    assert(/up to [0-9.]+ XAH/.test(header.text), `the caution does not say "up to": "${header.text}"`);
});

// The node is back: the app connects by itself, the caution asks again and is exact
Given('the Remit caution should become exact within {int} sec', { timeout: 5 * 60 * 1000 }, async (seconds) => {
    const deadline = Date.now() + seconds * 1000;
    let header;
    while (Date.now() < deadline) {
        header = await cautionHeader();
        if (header && header.exact) {
            assert(/: [0-9.]+ XAH extra/.test(header.text), `no amount in "${header.text}"`);
            assert(!/up to/.test(header.text), `still "up to": "${header.text}"`);
            return;
        }
        await sleep(1500);
    }
    throw new Error(`the caution is not exact after ${seconds} s: "${header ? header.text : 'not on screen'}"`);
});
