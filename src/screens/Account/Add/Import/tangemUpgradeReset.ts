import { AccountTypes, EncryptionLevels } from '@store/types';

import { SecretTypes } from './types';

export type TangemImportAccount = {
    type?: AccountTypes;
    additionalInfoString?: string;
    encryptionLevel?: EncryptionLevels;
    encryptionVersion?: number;
};

export type TangemImportSlice = {
    secretType: SecretTypes;
    scannedTangemCard?: unknown;
    tangemSignature?: string;
    account: TangemImportAccount;
};

export const stateForSecretType = <T extends TangemImportSlice>(state: T, type: SecretTypes): T => {
    if (type === SecretTypes.Tangem) {
        return { ...state, secretType: type };
    }

    const account =
        state.account?.type === AccountTypes.Tangem
            ? {
                  ...state.account,
                  type: AccountTypes.Regular,
                  additionalInfoString: undefined,
                  encryptionLevel: undefined,
                  encryptionVersion: undefined,
              }
            : state.account;

    return {
        ...state,
        secretType: type,
        scannedTangemCard: undefined,
        tangemSignature: undefined,
        account,
    };
};

export const shouldFinishTangemUpgrade = (input: {
    nextStep?: string;
    hasUpgradeAccount: boolean;
    secretType?: SecretTypes;
    hasScannedCard: boolean;
}): boolean => {
    return (
        input.nextStep === 'ConfirmPublicKey' &&
        input.hasUpgradeAccount &&
        input.secretType === SecretTypes.Tangem &&
        input.hasScannedCard
    );
};
