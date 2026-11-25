/**
 * What the app relies on in the real client (xrpl-client), with a node that can not be reached. No mock:
 * when a new version of the client reports this state in another way, this test fails, not the app.
 *
 * Nothing listens on port 9 of this machine: every connection attempt is refused at once. The client waits
 * between its attempts, so the test takes about 10 seconds.
 */
import { XrplClient } from 'xrpl-client';

import { CLIENT_GAVE_UP } from '../NetworkService';

const NOWHERE = 'ws://127.0.0.1:9';
// the options of NetworkService.connect
const OPTIONS = { maxConnectionAttempts: 3, assumeOfflineAfterSeconds: 10, connectAttemptTimeoutSeconds: 4 };

const sleep = (ms: number) =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

describe('the real client, one node that can not be reached', () => {
    jest.setTimeout(60000);

    let client: XrplClient;
    const errors: string[] = [];
    let online = false;

    beforeAll(async () => {
        client = new XrplClient([NOWHERE], OPTIONS);
        client.on('error', (error: any) => errors.push(String(error?.message)));
        client.on('online', () => {
            online = true;
        });
        for (let i = 0; i < 80 && !errors.length; i += 1) {
            await sleep(250);
        }
    });

    afterAll(() => {
        client.destroy();
        client.removeAllListeners();
        client.on('error', () => undefined);
    });

    it('gives up with the error that the app looks for', () => {
        expect(errors.length).toBeGreaterThan(0);
        expect(CLIENT_GAVE_UP.test(errors[0])).toBe(true);
        expect(online).toBe(false);
    });

    it('is not started again by reinstate: it gives up again at once (so the app makes a new client)', async () => {
        const before = errors.length;
        client.reinstate();
        await sleep(300);
        expect(errors.length).toBeGreaterThan(before);
        expect(CLIENT_GAVE_UP.test(errors[errors.length - 1])).toBe(true);
        expect(client.getState().online).toBe(false);
    });

    it('can be destroyed after it gave up, also twice, and says nothing after that', async () => {
        expect(() => client.destroy()).not.toThrow();
        expect(() => client.destroy()).not.toThrow();
        const before = errors.length;
        await sleep(500);
        expect(errors.length).toBe(before);
    });
});
