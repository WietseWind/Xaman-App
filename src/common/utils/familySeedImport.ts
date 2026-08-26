/**
 * Family seed import: secp256k1 (default, omit algorithm) vs ed25519.
 * Suggests ed25519 only when that account is activated and secp is not.
 */
import { derive, XRPL_Account } from 'xrpl-accountlib';

import { isLedgerAccountActivated } from './mnemonicImport';

export type FamilySeedAlgorithm = 'secp256k1' | 'ed25519';

export type FamilySeedCurvePick = {
    algorithm: FamilySeedAlgorithm;
    address: string;
    confirm?: {
        algorithm: FamilySeedAlgorithm;
        address: string;
    };
};

export const isFamilySeedCurvePickerEligible = (secret?: string): boolean => {
    if (typeof secret !== 'string') {
        return false;
    }

    const trimmed = secret.trim();
    return trimmed.length > 15 && /^s/.test(trimmed) && !/^sed/i.test(trimmed);
};

export const deriveFamilySeedAccount = (secret: string, algorithm?: FamilySeedAlgorithm): XRPL_Account => {
    if (algorithm === 'ed25519') {
        return derive.familySeed(secret, { algorithm: 'ed25519' });
    }

    return derive.familySeed(secret);
};

export const pickFamilySeedCurve = async ({
    secret,
    getAccountInfo,
}: {
    secret: string;
    getAccountInfo: (address: string) => Promise<any>;
}): Promise<FamilySeedCurvePick> => {
    const secp = deriveFamilySeedAccount(secret);
    const ed = deriveFamilySeedAccount(secret, 'ed25519');
    const secpAddress = secp.address as string;
    const edAddress = ed.address as string;

    const [secpInfo, edInfo] = await Promise.all([
        getAccountInfo(secpAddress).catch(() => undefined),
        getAccountInfo(edAddress).catch(() => undefined),
    ]);

    const secpOn = isLedgerAccountActivated(secpInfo);
    const edOn = isLedgerAccountActivated(edInfo);

    if (edOn && !secpOn) {
        return {
            algorithm: 'ed25519',
            address: edAddress,
            confirm: {
                algorithm: 'ed25519',
                address: edAddress,
            },
        };
    }

    return {
        algorithm: 'secp256k1',
        address: secpAddress,
    };
};
