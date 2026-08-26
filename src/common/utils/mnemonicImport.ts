/**
 * Mnemonic import: secp256k1 (default BIP32) vs ed25519 (SLIP-0010).
 * Default handling never sends algorithm so accountlib stays secp256k1.
 */
import { derive, XRPL_Account } from 'xrpl-accountlib';

export type MnemonicAlgorithm = 'secp256k1' | 'ed25519';

export type MnemonicDeriveOptions = {
    passphrase?: string;
    accountPath?: string;
    changePath?: string;
    addressIndex?: string | number;
};

export type MnemonicImportPick =
    | { status: 'ready'; algorithm: MnemonicAlgorithm; account: XRPL_Account }
    | { status: 'conflict'; secp: XRPL_Account; ed: XRPL_Account };

const compactOptions = (
    options?: MnemonicDeriveOptions & { algorithm?: MnemonicAlgorithm },
): Record<string, unknown> | undefined => {
    if (!options) {
        return undefined;
    }

    const out: Record<string, unknown> = {};

    if (options.passphrase) {
        out.passphrase = options.passphrase;
    }
    if (options.accountPath) {
        out.accountPath = String(options.accountPath);
    }
    if (options.changePath) {
        out.changePath = String(options.changePath);
    }
    if (options.addressIndex !== undefined && options.addressIndex !== '') {
        const index = Number(options.addressIndex);
        if (Number.isFinite(index)) {
            out.addressIndex = index;
        }
    }
    if (options.algorithm && options.algorithm !== 'secp256k1') {
        out.algorithm = options.algorithm;
    }

    return Object.keys(out).length > 0 ? out : undefined;
};

export const deriveMnemonicAccount = (
    mnemonic: string,
    options?: MnemonicDeriveOptions & { algorithm?: MnemonicAlgorithm },
): XRPL_Account => {
    const compacted = compactOptions(options);
    return compacted ? derive.mnemonic(mnemonic, compacted as any) : derive.mnemonic(mnemonic);
};

export const isLedgerAccountActivated = (accountInfo: any): boolean => {
    if (!accountInfo || typeof accountInfo !== 'object') {
        return false;
    }
    if (accountInfo.error === 'actNotFound') {
        return false;
    }
    return !!accountInfo.account_data;
};

export const pickMnemonicImport = async ({
    mnemonic,
    deriveOptions,
    explicitAlgorithm,
    getAccountInfo,
}: {
    mnemonic: string;
    deriveOptions?: MnemonicDeriveOptions;
    explicitAlgorithm?: MnemonicAlgorithm;
    getAccountInfo: (address: string) => Promise<any>;
}): Promise<MnemonicImportPick> => {
    if (explicitAlgorithm) {
        return {
            status: 'ready',
            algorithm: explicitAlgorithm,
            account: deriveMnemonicAccount(mnemonic, { ...deriveOptions, algorithm: explicitAlgorithm }),
        };
    }

    const secp = deriveMnemonicAccount(mnemonic, deriveOptions);
    const ed = deriveMnemonicAccount(mnemonic, { ...deriveOptions, algorithm: 'ed25519' });

    const [secpInfo, edInfo] = await Promise.all([
        getAccountInfo(secp.address as string).catch(() => undefined),
        getAccountInfo(ed.address as string).catch(() => undefined),
    ]);

    const secpOn = isLedgerAccountActivated(secpInfo);
    const edOn = isLedgerAccountActivated(edInfo);

    if (secpOn && edOn) {
        return { status: 'conflict', secp, ed };
    }

    if (edOn && !secpOn) {
        return { status: 'ready', algorithm: 'ed25519', account: ed };
    }

    return { status: 'ready', algorithm: 'secp256k1', account: secp };
};
