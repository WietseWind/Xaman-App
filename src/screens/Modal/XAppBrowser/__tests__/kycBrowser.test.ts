/**
 * The identity check of Veriff runs in the browser of the phone (issue 541): which link may go there, and
 * when the xApp gets its answer.
 */
import { KycBrowser, isVeriffSessionUrl, KYC_BROWSER_STATUS } from '../kycBrowser';

const SESSION_URL = 'https://saas.veriff.com/v/eyJhbGciOiJIUzI1NiJ9.eyJzZXNzaW9uX2lkIjoiMSJ9.c2lnbmF0dXJl-_';

const setup = (openURL: (url: string) => Promise<unknown> = () => Promise.resolve()) => {
    const actions = { openURL: jest.fn(openURL), onReturn: jest.fn(), onFail: jest.fn() };
    return { actions, kyc: new KycBrowser(actions) };
};
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('isVeriffSessionUrl', () => {
    it('takes an https link of a host under veriff.com or veriff.me', () => {
        for (const url of [
            SESSION_URL,
            'https://magic.veriff.me/v/abc',
            'https://alchemy.veriff.com/v/a?b=c&d=e',
            'https://a.b.veriff.com/',
        ]) {
            expect([url, isVeriffSessionUrl(url)]).toEqual([url, true]);
        }
    });

    it('refuses every other link and every other value', () => {
        for (const url of [
            '',
            'http://saas.veriff.com/v/abc',
            'https://veriff.com/v/abc',
            'https://veriff.com.evil.example/v/abc',
            'https://evil.example/?next=https://saas.veriff.com/v/abc',
            'https://saasveriff.com/v/abc',
            'https://user@saas.veriff.com/v/abc',
            'https://saas.veriff.com:8443/v/abc',
            'https://SAAS.VERIFF.COM/v/abc',
            'https://saas.veriff.com',
            'https://saas.veriff.com/v/a b',
            'https://saas.veriff.com/v/a\nb',
            'https://saas.veriff.com/v/"x',
            ' https://saas.veriff.com/v/abc',
            'javascript:alert(1)',
            'intent://saas.veriff.com/v/abc#Intent;scheme=https;end',
            'xumm://saas.veriff.com/v/abc',
            `https://saas.veriff.com/v/${'a'.repeat(2048)}`,
            undefined,
            null,
            42,
            { sessionUrl: SESSION_URL },
            [SESSION_URL],
        ]) {
            expect([url, isVeriffSessionUrl(url)]).toEqual([url, false]);
        }
    });
});

describe('KycBrowser', () => {
    it('opens a session link of Veriff in the browser', () => {
        const { kyc, actions } = setup();
        expect(kyc.start(SESSION_URL)).toBe(true);
        expect(actions.openURL).toHaveBeenCalledTimes(1);
        expect(actions.openURL).toHaveBeenCalledWith(SESSION_URL);
    });

    it('opens nothing for another link', () => {
        const { kyc, actions } = setup();
        expect(kyc.start('https://evil.example/v/abc')).toBe(false);
        expect(kyc.start(undefined)).toBe(false);
        expect(actions.openURL).not.toHaveBeenCalled();
        // and gives no answer later
        kyc.onAppState(false);
        kyc.onAppState(true);
        expect(actions.onReturn).not.toHaveBeenCalled();
    });

    it('tells the xApp once when Xaman is in front again after the browser', () => {
        const { kyc, actions } = setup();
        kyc.start(SESSION_URL);

        // still in front (the browser is opening): nothing
        kyc.onAppState(true);
        expect(actions.onReturn).not.toHaveBeenCalled();

        // away (inactive, then background), then back
        kyc.onAppState(false);
        kyc.onAppState(false);
        expect(actions.onReturn).not.toHaveBeenCalled();
        kyc.onAppState(true);
        expect(actions.onReturn).toHaveBeenCalledTimes(1);

        // a later switch to another app is not a return from the check
        kyc.onAppState(false);
        kyc.onAppState(true);
        expect(actions.onReturn).toHaveBeenCalledTimes(1);
    });

    it('a second start gives one answer, for the last start', () => {
        const { kyc, actions } = setup();
        kyc.start(SESSION_URL);
        kyc.onAppState(false);
        kyc.onAppState(true);
        kyc.start(SESSION_URL);
        kyc.onAppState(false);
        kyc.onAppState(true);
        expect(actions.openURL).toHaveBeenCalledTimes(2);
        expect(actions.onReturn).toHaveBeenCalledTimes(2);
    });

    it('the phone cannot open the link: onFail, and no answer on a later return', async () => {
        const { kyc, actions } = setup(() => Promise.reject(new Error('no browser')));
        expect(kyc.start(SESSION_URL)).toBe(true);
        await settle();
        expect(actions.onFail).toHaveBeenCalledTimes(1);
        kyc.onAppState(false);
        kyc.onAppState(true);
        expect(actions.onReturn).not.toHaveBeenCalled();
    });

    it('openURL throws at once: onFail, no exception for the caller', async () => {
        const { kyc, actions } = setup(() => {
            throw new Error('boom');
        });
        expect(() => kyc.start(SESSION_URL)).not.toThrow();
        await settle();
        expect(actions.onFail).toHaveBeenCalledTimes(1);
    });

    it('a late failure after Xaman left the foreground is no failure: the browser did open', async () => {
        let fail: (error: Error) => void = () => {};
        const { kyc, actions } = setup(() => new Promise((_, reject) => { fail = reject; }));
        kyc.start(SESSION_URL);
        kyc.onAppState(false);
        fail(new Error('late'));
        await settle();
        expect(actions.onFail).not.toHaveBeenCalled();
        kyc.onAppState(true);
        expect(actions.onReturn).toHaveBeenCalledTimes(1);
    });

    it('reset (the xApp screen closes, another xApp starts): no answer for a page that is gone', () => {
        const { kyc, actions } = setup();
        kyc.start(SESSION_URL);
        kyc.onAppState(false);
        kyc.reset();
        kyc.onAppState(true);
        expect(actions.onReturn).not.toHaveBeenCalled();
    });

    it('the status of the answer is not a status of the native SDK', () => {
        expect(KYC_BROWSER_STATUS).toBe('STATUS_BROWSER');
        expect(KYC_BROWSER_STATUS).not.toMatch(/CANCELED|DONE|ERROR/);
    });
});
