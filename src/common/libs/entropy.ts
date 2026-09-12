import { HDKey } from '@scure/bip32';
import { HexEncoding } from '@common/utils/string';
import { SHA256 } from './crypto';

const MAGIC_VALUE = 0xd8554d4d; // "XUMM" with high bit set on first byte for hardening
const HARDENED_VALUE = 0x80000000;

/**
 * Derive an `HDKey` node down a path of indices.
 */
const derivePath = (node: HDKey, indices: number[]): HDKey => {
    return indices.reduce((current, index) => current.deriveChild(index), node);
};

/**
 * Get an array of `uint32 | 0x80000000` values from a hash. The hash is assumed
 * to be 32 bytes long.
 */
const getUint32Array = (hash: Uint8Array): number[] => {
    const array: number[] = [];
    const view = new DataView(hash.buffer, hash.byteOffset, hash.byteLength);

    for (let index = 0; index < 8; index++) {
        const uint32 = view.getUint32(index * 4);
        array.push((uint32 | HARDENED_VALUE) >>> 0);
    }

    return array;
};

/**
 * Derive deterministic, app-specific entropy from an account's stored private
 * key using BIP-32. The app id and salt are hashed into a BIP-32 derivation
 * path, which is then used to derive a private key that is returned as entropy.
 */
export const deriveEntropy = async (privateKeyHex: string, appid: string, salt: string): Promise<string> => {
    const saltHash = await SHA256(salt);
    const hashHex = await SHA256(`${appid}:${saltHash}`);
    const computedDerivationPath = getUint32Array(Uint8Array.from(HexEncoding.toBinary(hashHex)));

    // Derive the entropy using BIP-32, prefixed with the magic value.
    const master = HDKey.fromMasterSeed(Uint8Array.from(HexEncoding.toBinary(privateKeyHex)));
    const { privateKey: entropy } = derivePath(master, [MAGIC_VALUE, ...computedDerivationPath]);

    if (!entropy) {
        throw new Error('Failed to derive entropy.');
    }

    return HexEncoding.toHex(Buffer.from(entropy));
};
