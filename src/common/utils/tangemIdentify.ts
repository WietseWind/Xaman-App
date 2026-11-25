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

export const tangemIdentifySessionLog = ({
    lookingForSerial,
    lookingForAddress,
    scannedSerial,
    scannedAddress,
    outcome,
}: {
    lookingForSerial: string;
    lookingForAddress: string;
    scannedSerial: string;
    scannedAddress: string;
    outcome: TangemIdentifyOutcome;
}): string => {
    let finding = 'Not in Xaman';

    if (outcome.outcome === 'match') {
        finding = 'Correct card';
    } else if (outcome.outcome === 'known') {
        const name = outcome.account.label || outcome.account.address;
        finding = `In Xaman, different card: ${name} ${outcome.account.address}`;
    }

    return (
        `Identify Tangem card: looking for ${lookingForSerial} ${lookingForAddress}, ` +
        `scanned: ${scannedSerial} ${scannedAddress} = ${finding}`
    );
};
