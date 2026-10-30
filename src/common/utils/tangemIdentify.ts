import { AccountTypes } from '@store/types';

import { GetCardId } from './tangem';

export type TangemAccountRef = {
    address: string;
    label?: string | null;
    type?: string;
    additionalInfo?: unknown;
};

export const tangemCardSerial = (account: TangemAccountRef): string | undefined => {
    if (account.type !== AccountTypes.Tangem || !account.additionalInfo) {
        return undefined;
    }

    try {
        return GetCardId(account.additionalInfo as Parameters<typeof GetCardId>[0]);
    } catch {
        return undefined;
    }
};

export type TangemIdentifyOutcome =
    | { outcome: 'match' }
    | { outcome: 'known'; account: TangemAccountRef }
    | { outcome: 'unknown' };

export const identifyScannedTangemSerial = (
    scannedSerial: string,
    selectedSerial: string,
    accounts: TangemAccountRef[],
): TangemIdentifyOutcome => {
    if (scannedSerial && scannedSerial === selectedSerial) {
        return { outcome: 'match' };
    }

    const known = accounts.find((account) => tangemCardSerial(account) === scannedSerial);

    if (known) {
        return { outcome: 'known', account: known };
    }

    return { outcome: 'unknown' };
};
