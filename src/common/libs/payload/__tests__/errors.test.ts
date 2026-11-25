/**
 * Payload error messages are translated when they are read. Since expo/metro-config (inlineRequires off) the
 * payload library loads at startup through the services, before Localize.setLocale; messages built at module
 * load read "[missing "en.payload.payloadHandledByAnotherClient" translation]" (e2e on build 474).
 */
describe('PayloadErrors', () => {
    it('are translated when read, also when the module loaded before the locale was set', () => {
        jest.isolateModules(() => {
            // a fresh Localize without translations, like at app startup
            // eslint-disable-next-line global-require
            const Locale = require('@locale').default;
            // eslint-disable-next-line global-require
            const { PayloadErrors } = require('../errors');

            Locale.setLocale('en');

            expect(PayloadErrors[403]).toBe('Payload handled by another client');
            expect(PayloadErrors[510]).toBe(Locale.t('payload.payloadExpired'));
            Object.values(PayloadErrors).forEach((message) => expect(message).not.toMatch(/^\[missing /));
        });
    });

    it('keeps the known codes for the "in" check', () => {
        // eslint-disable-next-line global-require
        const { PayloadErrors } = require('../errors');

        expect(403 in PayloadErrors).toBe(true);
        expect(804 in PayloadErrors).toBe(true);
        expect(500 in PayloadErrors).toBe(false);
        expect(Object.keys(PayloadErrors)).toHaveLength(13);
    });
});
