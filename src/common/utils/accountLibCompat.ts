/**
 * xrpl-accountlib 9.3.0 calls codec.nativeAsset.set() on every sign().
 * Metro/Hermes CJS interop can leave that named export undefined on the
 * required module. Attach it in our code so we never patch accountlib dist.
 */
export const ensureAccountLibNativeAsset = () => {
    try {
        // Same specifier accountlib's sign() requires.
        // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
        const codec = require('xrpl-binary-codec-prerelease');
        const nativeAsset = codec?.nativeAsset || codec?.default?.nativeAsset;
        if (!nativeAsset || typeof nativeAsset.set !== 'function') {
            return;
        }
        if (!codec.nativeAsset) {
            codec.nativeAsset = nativeAsset;
        }
        if (codec.default && !codec.default.nativeAsset) {
            codec.default.nativeAsset = nativeAsset;
        }
    } catch {
        //
    }
};
