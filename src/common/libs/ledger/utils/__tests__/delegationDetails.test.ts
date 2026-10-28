import fs from 'fs';
import path from 'path';
import Localize from '@locale';
import en from '@locale/en.json';
import {
    delegationDescription, delegationPermissionDetail, delegationPermissionValues, hasCriticalDelegation,
    transactionHasCriticalDelegation,
} from '../delegationDetails';

const types = { Payment: 0, NFTokenModify: 61, FuturePermission: 1024 };

afterEach(() => Localize.setLocale('en'));

describe('delegation permission explanations', () => {
    it('uses the selected network mapping for whole permissions by name, number and numeric string', () => {
        for (const value of ['Payment', 1, '1']) {
            const detail = delegationPermissionDetail(value, types);
            expect(detail).toMatchObject({ name: 'Payment', critical: true, unknown: false });
            expect(detail.explanation).toContain('destination and amount');
        }
        expect(delegationPermissionDetail(62, types).name).toBe('NFTokenModify');
        expect(delegationPermissionDetail(62, { Payment: 61 }).name).toBe('Payment');
    });

    it.each([0, 65536, 65549, 1025, 'FuturePermission', 'NotInDefinitions', null, undefined, {}, -1, 1.5])(
        'warns explicitly when the meaning of %p cannot be explained', (value) => {
            const detail = delegationPermissionDetail(value, types);
            expect(detail).toMatchObject({ unknown: true, critical: true, icon: 'IconAlertTriangle' });
            expect(detail.explanation).toContain('cannot explain');
            expect(detail.risk).toContain('do not proceed');
        },
    );

    it('explains all twelve granular permissions by name and number', () => {
        Object.keys(en.delegation.granular).forEach((name, index) => {
            const named = delegationPermissionDetail(name, types);
            expect(named.unknown).toBe(false);
            expect(named.explanation).not.toBe(name);
            expect(delegationPermissionDetail(65537 + index, types)).toEqual(named);
        });
        expect(delegationPermissionDetail('PaymentBurn', types).risk).toContain('fixCleanup3_4_0');
        expect(delegationPermissionDetail('PaymentBurn', types).risk).toContain('also create tokens');
    });

    it('uses the pinned native asset on Xahau rather than naming XRP', () => {
        const payment = delegationPermissionDetail('Payment', types, 'XAH');
        expect(payment.explanation).toContain('Send XAH');
        expect(payment.explanation).not.toContain('XRP');
        const ticket = delegationPermissionDetail('TicketCreate', { TicketCreate: 10 }, 'XAH');
        expect(ticket.risk).toContain('XAH');
        expect(ticket.risk).not.toContain('%{nativeAsset}');
    });

    it('warns when a known permission lacks a translation, without guessing from the name', () => {
        Localize.setLocaleBundle('missing', { delegation: en.delegation });
        expect(delegationPermissionDetail('Payment', types).unknown).toBe(true);
        Localize.setLocaleBundle('missing-detail', { ...en, delegation: { ...en.delegation, whole: {} } });
        expect(delegationPermissionDetail('Payment', types).unknown).toBe(true);
    });

    it('accepts ledger wrappers and decoded transaction entries without dropping malformed values', () => {
        expect(delegationPermissionValues([
            { Permission: { PermissionValue: 1 } }, { PermissionValue: 'NFTokenModify' }, {},
        ])).toEqual([1, 'NFTokenModify', undefined]);
    });

    it('matches the red permission mark for the accept confirmation', () => {
        const payment = [{ Permission: { PermissionValue: 'Payment' } }];
        const safe = [{ PermissionValue: 'NFTokenModify' }];
        expect(hasCriticalDelegation(payment, types)).toBe(true);
        expect(hasCriticalDelegation(safe, types)).toBe(false);
        expect(hasCriticalDelegation([], types)).toBe(false);
        expect(transactionHasCriticalDelegation({
            Type: 'DelegateSet',
            Permissions: payment,
            SigningDefinitions: { rawDefinitions: { TRANSACTION_TYPES: types } },
        })).toBe(true);
        expect(transactionHasCriticalDelegation({ Type: 'DelegateSet', Permissions: [] })).toBe(false);
        expect(transactionHasCriticalDelegation({ Type: 'Payment', Permissions: payment })).toBe(false);
    });

    it('explains replace-all semantics and keeps the account direction in plain descriptions', () => {
        const text = delegationDescription('owner', 'delegate', [{ PermissionValue: 1 }], types, 'grant');
        expect(text).toContain('Account granting permissions: owner');
        expect(text).toContain('Account receiving permissions: delegate');
        expect(text).toContain('Previous permissions not listed will be revoked');
        expect(text).toContain(Localize.t('delegation.whole.Payment', { nativeAsset: 'XRP' }));
        const revoked = delegationDescription('owner', 'delegate', [], types, 'revoke');
        expect(revoked).toContain('Account revoking permissions: owner');
        expect(revoked).toContain('Account losing permissions: delegate');
        expect(revoked).not.toContain('Account granting permissions');
        expect(revoked).toContain('Other delegations are unchanged');
        expect(revoked).not.toContain(en.delegation.whole.Payment);
    });
});

describe('delegation translations', () => {
    const dir = path.resolve(__dirname, '../../../../../locale/translations');
    const files = fs.readdirSync(dir).filter(file => file.endsWith('.json'));
    it.each(['en', ...files.map(file => file.replace('.json', ''))])(
        'provides explanations and warnings for every known permission in %s', (locale) => {
            Localize.setLocale(locale);
            const bundle = Localize.instance.translations[Localize.getCurrentLocale()];
            expect(Localize.getCurrentLocale()).toBe(locale);
            for (const name of Object.keys(en.delegation.whole)) {
                const detail = delegationPermissionDetail(name, { [name]: 1 });
                expect(detail.unknown).toBe(false);
                expect(detail.explanation).toBe(bundle.delegation.whole[name].replace('%{nativeAsset}', 'XRP'));
                expect(detail.risk).not.toContain('missing');
            }
            for (const name of Object.keys(en.delegation.granular)) {
                expect(delegationPermissionDetail(name, types).unknown).toBe(false);
            }
            for (const key of ['authorisations', 'explanation', 'replacesPermissions', 'revokeExplanation',
                'ownerRevoke', 'delegateRevoke', 'unknownPermission', 'unknownRisk']) {
                expect(bundle.delegation[key]).toEqual(expect.any(String));
                expect(bundle.delegation[key].trim()).not.toBe('');
                if (!locale.startsWith('en')) expect(bundle.delegation[key]).not.toBe((en.delegation as any)[key]);
            }
        },
    );
});
