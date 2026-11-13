import { OperationActions } from '@common/libs/ledger/parser/types';

import { batchInnerBalanceChange, netBalanceChanges, ranInBatch } from '../batchInner';

const BATCH = 'A'.repeat(64);
const OTHER_BATCH = 'B'.repeat(64);
const ISSUER = 'rIssuerxxxxxxxxxxxxxxxxxxxxxxxxxxx';

const inc = (value: string, currency = 'XRP', extra: Record<string, string> = {}) => ({
    action: OperationActions.INC,
    value,
    currency,
    ...extra,
});
const dec = (value: string, currency = 'XRP', extra: Record<string, string> = {}) => ({
    action: OperationActions.DEC,
    value,
    currency,
    ...extra,
});
const changes = (INC: any[] = [], DEC: any[] = []) => ({ INC, DEC });

const inner = (perOwner: Record<string, ReturnType<typeof changes>>, overrides: Record<string, unknown> = {}) => ({
    transaction: { BalanceChange: (owner?: string) => perOwner[owner || ''] || changes() },
    hash: 'C'.repeat(64),
    index: 0,
    found: true,
    parentBatchId: BATCH,
    ...overrides,
});

describe('ranInBatch', () => {
    it('is true only for an inner transaction the ledger has, executed by this Batch', () => {
        expect(ranInBatch(inner({}), BATCH)).toBe(true);
        expect(ranInBatch(inner({}, { found: false }), BATCH)).toBe(false);
        expect(ranInBatch(inner({}, { parentBatchId: OTHER_BATCH }), BATCH)).toBe(false);
        expect(ranInBatch(inner({}, { parentBatchId: undefined }), BATCH)).toBe(false);
        expect(ranInBatch(inner({}, { parentBatchId: undefined }), undefined)).toBe(false);
        expect(ranInBatch(inner({}), '')).toBe(false);
    });
});

describe('netBalanceChanges', () => {
    it('is empty for nothing', () => {
        expect(netBalanceChanges([])).toEqual(changes());
        expect(netBalanceChanges([changes(), changes()])).toEqual(changes());
    });

    it('keeps a single change as it is', () => {
        expect(netBalanceChanges([changes([inc('0.009675')])])).toEqual(changes([inc('0.009675')]));
        expect(netBalanceChanges([changes([], [dec('2.5')])])).toEqual(changes([], [dec('2.5')]));
    });

    it('nets what came in against what went out, per asset', () => {
        const net = netBalanceChanges([
            changes([inc('9.774495')], [dec('10.03', 'USD', { issuer: ISSUER })]),
            changes([], [dec('0.067732')]),
            changes([], [dec('0.009675')]),
        ]);
        expect(net).toEqual(changes([inc('9.697088')], [dec('10.03', 'USD', { issuer: ISSUER })]));
    });

    it('drops an asset that nets to zero', () => {
        expect(netBalanceChanges([changes([inc('1.5')]), changes([], [dec('1.5')])])).toEqual(changes());
    });

    it('turns a net loss into a decrease', () => {
        expect(netBalanceChanges([changes([inc('1')]), changes([], [dec('3')])])).toEqual(changes([], [dec('2')]));
    });

    it('keeps the same currency of different issuers, and MPTs, apart', () => {
        const net = netBalanceChanges([
            changes([inc('1', 'USD', { issuer: ISSUER }), inc('5', 'MPT', { mpt_issuance_id: '00AA' })]),
            changes([], [dec('1', 'USD', { issuer: 'rOtherIssuerxxxxxxxxxxxxxxxxxxxxxx' })]),
            changes([inc('2', 'MPT', { mpt_issuance_id: '00BB' })]),
        ]);
        expect(net.INC).toEqual([
            inc('1', 'USD', { issuer: ISSUER }),
            inc('5', 'MPT', { mpt_issuance_id: '00AA' }),
            inc('2', 'MPT', { mpt_issuance_id: '00BB' }),
        ]);
        expect(net.DEC).toEqual([dec('1', 'USD', { issuer: 'rOtherIssuerxxxxxxxxxxxxxxxxxxxxxx' })]);
    });

    it('does not lose precision on small and large values', () => {
        expect(netBalanceChanges([changes([inc('0.000001')]), changes([inc('0.000002')])])).toEqual(
            changes([inc('0.000003')]),
        );
        expect(
            netBalanceChanges([changes([inc('994673548.8615462', 'USD')]), changes([], [dec('0.0000002', 'USD')])]),
        ).toEqual(changes([inc('994673548.861546', 'USD')]));
    });

    it('ignores values that are not numbers and missing lists', () => {
        expect(netBalanceChanges([changes([inc('abc'), inc('1')]), {} as any, undefined as any])).toEqual(
            changes([inc('1')]),
        );
    });

    it('does not change its input', () => {
        const input = [changes([inc('1')]), changes([], [dec('3')])];
        const before = JSON.stringify(input);
        netBalanceChanges(input);
        expect(JSON.stringify(input)).toBe(before);
    });
});

describe('batchInnerBalanceChange', () => {
    const ME = 'rMe';
    const list = [
        inner({ rSender: changes([inc('9.774495')], [dec('10.03', 'USD')]) }),
        inner({ rSender: changes([], [dec('0.067732')]) }),
        inner({ rSender: changes([], [dec('0.009675')]), [ME]: changes([inc('0.009675')]) }),
    ];

    it('sums the inner transactions for the account asked for', () => {
        expect(batchInnerBalanceChange(list, BATCH, ME)).toEqual(changes([inc('0.009675')]));
        expect(batchInnerBalanceChange(list, BATCH, 'rSender')).toEqual(
            changes([inc('9.697088')], [dec('10.03', 'USD')]),
        );
        expect(batchInnerBalanceChange(list, BATCH, 'rStranger')).toEqual(changes());
    });

    it('leaves out inner transactions that did not run in this Batch', () => {
        const mixed = [
            inner({ [ME]: changes([inc('1')]) }),
            inner({ [ME]: changes([inc('10')]) }, { found: false }),
            inner({ [ME]: changes([inc('100')]) }, { parentBatchId: OTHER_BATCH }),
            inner({ [ME]: changes([inc('1000')]) }, { parentBatchId: undefined }),
        ];
        expect(batchInnerBalanceChange(mixed, BATCH, ME)).toEqual(changes([inc('1')]));
    });

    it('is empty without inner transactions or without a Batch hash', () => {
        expect(batchInnerBalanceChange(undefined, BATCH, ME)).toEqual(changes());
        expect(batchInnerBalanceChange([], BATCH, ME)).toEqual(changes());
        expect(batchInnerBalanceChange(list, undefined, ME)).toEqual(changes());
    });
});
