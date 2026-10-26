import { AccountTypes } from '@store/types';

import { SecretTypes } from '../types';
import { shouldFinishTangemUpgrade, stateForSecretType } from '../tangemUpgradeReset';

describe('tangem upgrade reset', () => {
    const tangemState = {
        secretType: SecretTypes.Tangem,
        scannedTangemCard: { cardId: 'CD1' },
        tangemSignature: 'sig',
        account: {
            type: AccountTypes.Tangem,
            address: 'rAddress',
            additionalInfoString: '{"cardId":"CD1"}',
        },
    };

    it('drops the card and Tangem type when another secret type is chosen', () => {
        const next = stateForSecretType(tangemState, SecretTypes.Mnemonic);

        expect(next.secretType).toBe(SecretTypes.Mnemonic);
        expect(next.scannedTangemCard).toBeUndefined();
        expect(next.tangemSignature).toBeUndefined();
        expect(next.account.type).toBe(AccountTypes.Regular);
        expect(next.account.address).toBe('rAddress');
        expect(next.account.additionalInfoString).toBeUndefined();
    });

    it('keeps the card while the selected method is still Tangem', () => {
        const next = stateForSecretType(tangemState, SecretTypes.Tangem);
        expect(next.scannedTangemCard).toEqual({ cardId: 'CD1' });
        expect(next.account.type).toBe(AccountTypes.Tangem);
    });

    it('finishes a Tangem upgrade only for the Tangem method with a scanned card', () => {
        expect(
            shouldFinishTangemUpgrade({
                nextStep: 'ConfirmPublicKey',
                hasUpgradeAccount: true,
                secretType: SecretTypes.Tangem,
                hasScannedCard: true,
            }),
        ).toBe(true);
        expect(
            shouldFinishTangemUpgrade({
                nextStep: 'ConfirmPublicKey',
                hasUpgradeAccount: true,
                secretType: SecretTypes.Mnemonic,
                hasScannedCard: true,
            }),
        ).toBe(false);
    });
});
