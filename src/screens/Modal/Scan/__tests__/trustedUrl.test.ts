import { isTrustedXamanUrl, isXamanTangemUrl, matchesLegacyXamanPrefix } from '../trustedUrl';

describe('trusted Xaman scan URLs', () => {
    const lookalike = 'https://xaman.app.evil.example/';

    it('reproduces the prefix bypass: lookalike hosts start with https://xaman.app', () => {
        expect(matchesLegacyXamanPrefix(lookalike)).toBe(true);
        expect(matchesLegacyXamanPrefix('https://help.xaman.app.attacker.test/foo')).toBe(true);
    });

    it('rejects lookalike hosts and accepts real help/site hosts', () => {
        expect(isTrustedXamanUrl(lookalike)).toBe(false);
        expect(isTrustedXamanUrl('https://help.xaman.app.attacker.test/foo')).toBe(false);
        expect(isTrustedXamanUrl('https://xaman.app/docs')).toBe(true);
        expect(isTrustedXamanUrl('https://help.xaman.app/article')).toBe(true);
        expect(isTrustedXamanUrl('https://xumm.app/')).toBe(true);
        expect(isTrustedXamanUrl('http://xaman.app/')).toBe(false);
    });

    it('only treats /tangem on the real site hosts as a Tangem card QR', () => {
        expect(isXamanTangemUrl('https://xaman.app/tangem')).toBe(true);
        expect(isXamanTangemUrl('https://xumm.app/tangem/setup')).toBe(true);
        expect(isXamanTangemUrl('https://xaman.app/tangem.evil')).toBe(false);
        expect(isXamanTangemUrl('https://xaman.app.evil.example/tangem')).toBe(false);
        expect(isXamanTangemUrl('https://user:secret@xaman.app/tangem')).toBe(false);
        expect(isXamanTangemUrl('https://xaman.app:443/tangem')).toBe(true);
        expect(isTrustedXamanUrl('https://HELP.XAMAN.APP/article')).toBe(true);
    });
});
