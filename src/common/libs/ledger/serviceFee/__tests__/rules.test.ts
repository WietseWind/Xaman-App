import {
    cappedServiceFeeDrops,
    changesForAccount,
    incomingXrpDrops,
    serviceFeeLastLedgerSequence,
    serviceFeeSequence,
    shouldSubmitBatchFee,
    shouldSubmitSingleFee,
    valueMoved,
} from '../rules';

const ACCOUNT = 'rAccount';
const xrp = (drops: number) => ({ currency: 'XRP', value: String(drops / 1_000_000) });

describe('service fee submit rules', () => {
    const fee = '12';

    it('sends an IoC fee when the offer fills in full', () => {
        const pays = '1606758343';
        expect(
            shouldSubmitSingleFee({
                result: 'tesSUCCESS',
                feeDrops: fee,
                changes: [xrp(Number(pays) - Number(fee))],
                submitCondition: { minMovedShare: 0.9, field: 'TakerPays', amount: pays },
            }),
        ).toBe(true);
    });

    it('does not send an IoC fee when the offer fills only half', () => {
        const pays = 1606758343;
        expect(
            shouldSubmitSingleFee({
                result: 'tesSUCCESS',
                feeDrops: fee,
                changes: [xrp(Math.floor(pays / 2) - Number(fee))],
                submitCondition: { minMovedShare: 0.9, field: 'TakerPays', amount: String(pays) },
            }),
        ).toBe(false);
    });

    it('sends a swap-to-self fee at 95% of SendMax and not at 80%', () => {
        const sendMax = 1_700_230_000;
        const condition = { minMovedShare: 0.9, field: 'SendMax', amount: String(sendMax) };
        const spent = (share: number) => [xrp(-Math.floor(sendMax * share) - Number(fee))];

        expect(
            shouldSubmitSingleFee({
                result: 'tesSUCCESS',
                feeDrops: fee,
                changes: spent(0.95),
                submitCondition: condition,
            }),
        ).toBe(true);
        expect(
            shouldSubmitSingleFee({
                result: 'tesSUCCESS',
                feeDrops: fee,
                changes: spent(0.8),
                submitCondition: condition,
            }),
        ).toBe(false);
    });

    it('does not send a fee when the only balance change is the network fee', () => {
        expect(valueMoved([xrp(-Number(fee))], fee)).toBe(false);
        expect(
            shouldSubmitSingleFee({
                result: 'tesSUCCESS',
                feeDrops: fee,
                changes: [xrp(-Number(fee))],
            }),
        ).toBe(false);
    });

    it('reads an only-fee account root from transaction meta', () => {
        const changes = changesForAccount(
            {
                AffectedNodes: [
                    {
                        ModifiedNode: {
                            LedgerEntryType: 'AccountRoot',
                            FinalFields: { Account: ACCOUNT, Balance: '999999988' },
                            PreviousFields: { Balance: '1000000000' },
                        },
                    },
                ],
            },
            ACCOUNT,
        );

        expect(valueMoved(changes, '12')).toBe(false);
    });

    it('signs the full fee when the trade brings the XRP in', () => {
        const quoted = 12_854_067;
        const offer = {
            TransactionType: 'OfferCreate',
            Account: ACCOUNT,
            TakerPays: '1606758343',
            Flags: 0x00020000,
        };
        expect(incomingXrpDrops(offer).toNumber()).toBe(1606758343);
        expect(cappedServiceFeeDrops(quoted, 0, incomingXrpDrops(offer).toNumber())).toBe(quoted);
    });

    it('keeps the old cap when the trade brings no XRP', () => {
        expect(cappedServiceFeeDrops(2_000_000, 500_000, 0)).toBe(499_900);
    });

    it('counts DeliverMin for a partial swap to self and Amount for a full one', () => {
        const self = { Account: ACCOUNT, Destination: ACCOUNT, TransactionType: 'Payment' };
        expect(incomingXrpDrops({ ...self, DeliverMin: '1000000', Flags: 0x00020000 }).toNumber()).toBe(1_000_000);
        expect(incomingXrpDrops({ ...self, Amount: '2500000', Flags: 0 }).toNumber()).toBe(2_500_000);
        expect(incomingXrpDrops({ ...self, Amount: '2500000', Flags: 0x00020000 }).toNumber()).toBe(0);
    });

    it('places a Batch fee one past the highest inner sequence of the outer account', () => {
        const batch = {
            TransactionType: 'Batch',
            Account: ACCOUNT,
            Sequence: 76396596,
            LastLedgerSequence: 107859757,
            Flags: 65536,
            RawTransactions: [
                { RawTransaction: { Account: ACCOUNT, Sequence: 76396597, TransactionType: 'Payment' } },
                { RawTransaction: { Account: ACCOUNT, Sequence: 76396598, TransactionType: 'Payment' } },
            ],
        };

        expect(serviceFeeSequence(batch)).toBe(76396599);
        expect(serviceFeeLastLedgerSequence(batch)).toBe(107859777);
    });

    it('leaves a ticket transaction without a fee sequence so the account sequence is read', () => {
        expect(
            serviceFeeSequence({
                TransactionType: 'Payment',
                Account: ACCOUNT,
                Sequence: 0,
                TicketSequence: 9,
            }),
        ).toBeUndefined();

        expect(
            serviceFeeSequence({
                TransactionType: 'Batch',
                Account: ACCOUNT,
                Sequence: 0,
                TicketSequence: 9,
                RawTransactions: [
                    {
                        RawTransaction: {
                            Account: ACCOUNT,
                            Sequence: 0,
                            TicketSequence: 9,
                            TransactionType: 'Payment',
                        },
                    },
                ],
            }),
        ).toBeUndefined();
    });

    it('uses Batch Sequence + 1 when every inner transaction is on a ticket', () => {
        expect(
            serviceFeeSequence({
                TransactionType: 'Batch',
                Account: ACCOUNT,
                Sequence: 40,
                RawTransactions: [
                    {
                        RawTransaction: {
                            Account: ACCOUNT,
                            Sequence: 0,
                            TicketSequence: 9,
                            TransactionType: 'Payment',
                        },
                    },
                ],
            }),
        ).toBe(41);
    });

    it('sends a Batch fee only after every required inner transaction succeeded', () => {
        const condition = {
            allRequiredInnerSucceeded: true as const,
            requiredInner: [1, 2],
            inner: [{ index: 2, minMovedShare: 0.9, field: 'SendMax', amount: '1000' }],
        };
        const filled = {
            result: 'tesSUCCESS',
            feeDrops: '0',
            changes: [{ currency: 'USD', value: '-1', counterparty: 'rIssuer' }],
        };
        const xrpIn = {
            result: 'tesSUCCESS',
            feeDrops: '0',
            changes: [xrp(1000)],
        };

        expect(
            shouldSubmitBatchFee(
                condition,
                new Map([
                    [1, filled],
                    [2, { ...xrpIn, changes: [xrp(950)] }],
                ]),
            ),
        ).toBe(true);

        expect(
            shouldSubmitBatchFee(
                condition,
                new Map([
                    [1, { ...filled, result: 'tecPATH_DRY' }],
                    [2, xrpIn],
                ]),
            ),
        ).toBe(false);

        expect(shouldSubmitBatchFee(condition, new Map())).toBe(false);

        expect(
            shouldSubmitBatchFee(
                { allRequiredInnerSucceeded: true, requiredInner: [2] },
                new Map([[2, { result: 'tecUNFUNDED_OFFER', feeDrops: '0', changes: [] }]]),
            ),
        ).toBe(false);
    });

    it('uses only the validated result and value movement when the quote has no condition', () => {
        expect(
            shouldSubmitSingleFee({
                result: 'tesSUCCESS',
                feeDrops: fee,
                changes: [{ currency: 'USD', value: '1', counterparty: 'rIssuer' }, xrp(-Number(fee))],
            }),
        ).toBe(true);
        expect(
            shouldSubmitSingleFee({
                result: 'tecUNFUNDED_OFFER',
                feeDrops: fee,
                changes: [xrp(1_000_000)],
            }),
        ).toBe(false);
    });
});
