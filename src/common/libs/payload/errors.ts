import Locale from '@locale';

// Translation keys per backend error code. The messages are translated when they are read, not when this
// module loads: since expo/metro-config (inlineRequires off) this module loads at startup through the
// services, before Localize.setLocale, and every message read "[missing "en.payload…" translation]".
const PAYLOAD_ERROR_KEYS: { [key: number]: string } = {
    402: 'monetization.monetizationRequiredForThisFeature',
    403: 'payload.payloadHandledByAnotherClient',
    404: 'payload.payloadNotFound',
    405: 'payload.invalidPayloadResult',
    409: 'payload.payloadAlreadyResolved',
    509: 'payload.payloadCouldNotBeUpdated',
    510: 'payload.payloadExpired',
    511: 'payload.payloadAlreadySigned',
    800: 'payload.invalidOrMissingSignedTransactionBlob',
    801: 'payload.transactionBlobDecodeError',
    802: 'payload.invalidTransactionId',
    803: 'payload.transactionIdMismatch',
    804: 'payload.InvalidMultiSignAccount',
};

const PayloadErrors: { readonly [key: number]: string } = Object.keys(PAYLOAD_ERROR_KEYS).reduce(
    (errors, code) =>
        Object.defineProperty(errors, code, {
            enumerable: true,
            get: () => Locale.t(PAYLOAD_ERROR_KEYS[Number(code)]),
        }),
    {},
);

export { PayloadErrors };
