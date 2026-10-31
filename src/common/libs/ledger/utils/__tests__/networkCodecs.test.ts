import { binary, derive, rawSigning, sign, XrplDefinitions } from 'xrpl-accountlib';
import { sign as signBytes, verify } from 'ripple-keypairs';
import NetworkService from '@services/NetworkService';
import { TransactionFactory } from '@common/libs/ledger/factory';
import { DelegateSet, Payment } from '@common/libs/ledger/transactions';

jest.mock('@services/NetworkService', () => ({
    __esModule: true,
    default: {
        getNetworkDefinitions: jest.fn(),
        getRawNetworkDefinitions: jest.fn(),
        getNetworkId: () => 0,
        getNetwork: () => ({ id: 'codec-test' }),
        getNativeAsset: () => 'XRP',
    },
}));

const account = derive.passphrase('Xaman network codec regression tests, no funds');
const authorize = 'rQHGELnuopj4fWjsrbMA53ViqRLt5bS8Hb';
const common = { Account: account.address, Fee: '12', Sequence: 1, SigningPubKey: '' };
// Fields from XRPL 3.4.1 server_definitions; the bundled snapshot predates sponsorship.
const rawDefinitions = () => ({
    ...binary.DEFAULT_DEFINITIONS,
    TRANSACTION_TYPES: { ...binary.DEFAULT_DEFINITIONS.TRANSACTION_TYPES, SponsorshipSet: 91 },
    FIELDS: [
        ...binary.DEFAULT_DEFINITIONS.FIELDS.filter(([name]) =>
            !['FeeAmountDelta', 'RemainingOwnerCountDelta', 'Sponsee'].includes(String(name))),
        ['FeeAmountDelta', {
            nth: 34, type: 'Amount', isSerialized: true, isSigningField: true, isVLEncoded: false,
        }],
        ['RemainingOwnerCountDelta', {
            nth: 2, type: 'Int32', isSerialized: true, isSigningField: true, isVLEncoded: false,
        }],
        ['Sponsee', {
            nth: 31, type: 'AccountID', isSerialized: true, isSigningField: true, isVLEncoded: true,
        }],
    ],
});

const definitions = () => new XrplDefinitions(rawDefinitions() as any);
const decodeSigned = (json: any, defs: XrplDefinitions) => {
    const signed = sign(json, account, defs);
    const decoded = binary.decode(signed.signedTransaction, defs);
    expect(verify(binary.encodeForSigning(decoded, defs), decoded.TxnSignature, decoded.SigningPubKey)).toBe(true);
    return decoded;
};

describe('network definition codecs', () => {
    beforeEach(() => {
        (NetworkService.getNetworkDefinitions as jest.Mock).mockReturnValue(definitions());
        (NetworkService.getRawNetworkDefinitions as jest.Mock).mockReturnValue(rawDefinitions());
    });

    it.each(['NFTokenModify', 62, 'AccountDomainSet', 65540])(
        'signs DelegateSet permission %s on a fresh definitions instance', (permission) => {
            const tx = new DelegateSet({ ...common, TransactionType: 'DelegateSet', Authorize: authorize,
                Permissions: [{ Permission: { PermissionValue: permission } }] } as any);
            expect(() => tx.assertSigningFields()).not.toThrow();
            const decoded = decodeSigned(tx.JsonForSigning, tx.SigningDefinitions);
            const expected = [62, 'NFTokenModify'].includes(permission) ? 'NFTokenModify' : 'AccountDomainSet';
            expect(decoded.Permissions[0].Permission.PermissionValue).toBe(expected);
        },
    );

    it('repairs the default transaction fallback without an extra caller-side association pass', () => {
        (NetworkService.getNetworkDefinitions as jest.Mock).mockReturnValue(undefined);
        const tx = new DelegateSet({ ...common, TransactionType: 'DelegateSet', Authorize: authorize,
            Permissions: [{ Permission: { PermissionValue: 'NFTokenModify' } }] } as any);
        expect(() => tx.assertSigningFields()).not.toThrow();
        expect(decodeSigned(tx.JsonForSigning, tx.SigningDefinitions).Permissions[0].Permission.PermissionValue)
            .toBe('NFTokenModify');
    });

    it('keeps the permission lookup after reassociation and when a network has no permission fields', () => {
        const defs = definitions();
        defs.associateTypes(defs.getAssociatedTypes());
        expect(defs.field.fromString('PermissionValue').associatedType).toBe(defs.delegatablePermissions);
        const raw = rawDefinitions();
        raw.FIELDS = raw.FIELDS.filter(([name]) => name !== 'PermissionValue');
        expect(() => new XrplDefinitions(raw as any)).not.toThrow();
    });

    it('rejects unknown permission names instead of dropping the permission', () => {
        const tx = new DelegateSet({ ...common, TransactionType: 'DelegateSet', Authorize: authorize,
            Permissions: [{ Permission: { PermissionValue: 'NotAPermission' } }] } as any);
        expect(() => tx.assertSigningFields()).toThrow();
    });

    it.each([
        [-2147483648, '80000000'], [-1, 'FFFFFFFF'], [0, '00000000'],
        [1, '00000001'], [2147483647, '7FFFFFFF'],
    ])('uses signed big-endian Int32 bytes for %s', (value, hex) => {
        const defs = definitions();
        expect(binary.encode({ LoanScale: value }, defs)).toBe(`A1${hex}`);
        expect(binary.decode(`A1${hex}`, defs)).toEqual({ LoanScale: value });
        const json = { RemainingOwnerCountDelta: value };
        expect(binary.decode(binary.encode(json, defs), defs)).toEqual(json);
    });

    it.each([-2147483649, 2147483648, 1.5, NaN, Infinity, '', '1.5', 'not-a-number'])(
        'refuses invalid Int32 input %s', (value) => {
            expect(() => binary.encode({ RemainingOwnerCountDelta: value }, definitions())).toThrow();
        },
    );

    it.each(['-100000000000000000', '-1000', '0', '-0', '1000', '100000000000000000'])(
        'round-trips the signed XRP delta %s', (value) => {
            const defs = definitions();
            const encoded = binary.encode({ FeeAmountDelta: value }, defs);
            const decoded = binary.decode(encoded, defs);
            expect(decoded.FeeAmountDelta).toBe(value === '-0' ? '0' : value);
            expect(binary.encode(decoded, defs)).toBe(encoded);
        },
    );

    it('keeps signed amount bytes intact across repeated JSON reads', () => {
        const defs = definitions();
        const type = defs.getAssociatedTypes().SignedAmount;
        const amount = type.from('-1000');
        const before = amount.toHex();
        expect(amount.toJSON()).toBe('-1000');
        expect(amount.toJSON()).toBe('-1000');
        expect(amount.toHex()).toBe(before);
    });

    it.each(['-100000000000000001', '100000000000000001', '-1.5', '1e3', '', 'NaN', 'Infinity'])(
        'refuses an invalid signed XRP delta %s', (value) => {
            expect(() => binary.encode({ FeeAmountDelta: value }, definitions())).toThrow();
        },
    );

    it('does not allow negative regular XRP payments or fees, or issued FeeAmountDelta values', () => {
        const defs = definitions();
        expect(() => binary.encode({ Amount: '-1000' }, defs)).toThrow();
        expect(() => binary.encode({ Fee: '-1000' }, defs)).toThrow();
        expect(() => binary.encode({ FeeAmountDelta: { currency: 'USD', issuer: authorize, value: '-1' } }, defs))
            .toThrow();
        expect(() => binary.encode({ Amount: '1000' }, defs)).not.toThrow();
    });

    it('signs both sponsorship deltas through the definitions-backed fallback model', () => {
        const tx = TransactionFactory.fromJson({ ...common, TransactionType: 'SponsorshipSet',
            Sponsee: authorize, FeeAmountDelta: '-1000', RemainingOwnerCountDelta: -1 } as any);
        expect(() => tx.assertSigningFields()).not.toThrow();
        expect(decodeSigned(tx.JsonForSigning, tx.SigningDefinitions)).toMatchObject({
            Sponsee: authorize, FeeAmountDelta: '-1000', RemainingOwnerCountDelta: -1,
        });
    });

    it('preserves DelegateSet permissions through raw signing used by Tangem', () => {
        const defs = definitions();
        const json = { ...common, TransactionType: 'DelegateSet', Authorize: authorize,
            Permissions: [{ Permission: { PermissionValue: 'NFTokenModify' } }] };
        const prepared = rawSigning.prepare(json, account.keypair.publicKey, false, defs);
        const der = Buffer.from(signBytes(prepared.message, account.keypair.privateKey), 'hex');
        const rLength = der[3];
        const sLength = der[5 + rLength];
        const signature = [der.subarray(4, 4 + rLength), der.subarray(6 + rLength, 6 + rLength + sLength)]
            .map((part) => part.subarray(-32).toString('hex').padStart(64, '0')).join('');
        const signed = rawSigning.complete(prepared, signature, defs);
        const decoded = binary.decode(signed.signedTransaction, defs);
        expect(decoded.Permissions[0].Permission.PermissionValue).toBe('NFTokenModify');
        expect(verify(binary.encodeForSigning(decoded, defs), decoded.TxnSignature, decoded.SigningPubKey)).toBe(true);
    });

    it('preserves signed sponsorship deltas in multisigning', () => {
        const defs = definitions();
        const signed = sign({ ...common, TransactionType: 'SponsorshipSet', Sponsee: authorize,
            FeeAmountDelta: '-1000', RemainingOwnerCountDelta: -1 }, account.signAs(account.address), defs);
        const decoded = binary.decode(signed.signedTransaction, defs);
        expect(decoded.FeeAmountDelta).toBe('-1000');
        expect(decoded.RemainingOwnerCountDelta).toBe(-1);
        const signer = decoded.Signers[0].Signer;
        expect(verify(binary.encodeForMultisigning(decoded, signer.Account, defs),
            signer.TxnSignature, signer.SigningPubKey)).toBe(true);
    });

    it('keeps the guard for a genuinely unsupported field type', () => {
        const raw = rawDefinitions();
        raw.TYPES = { ...raw.TYPES, FutureWireType: 99 };
        raw.FIELDS.push(['FutureValue', {
            nth: 1, type: 'FutureWireType', isSerialized: true, isSigningField: true, isVLEncoded: false,
        }]);
        (NetworkService.getNetworkDefinitions as jest.Mock).mockReturnValue(new XrplDefinitions(raw as any));
        const tx = new Payment({ ...common, TransactionType: 'Payment', Destination: authorize,
            Amount: '1000', FutureValue: 'AB' } as any);
        expect(() => tx.assertSigningFields()).toThrow('FutureValue');
    });
});
