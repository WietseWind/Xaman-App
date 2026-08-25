import { TransactionTypes } from '@common/libs/ledger/types/enums';

import { shouldLookupAdvisorySender } from '../shouldHideAdvisoryEvent';

const ME = 'rMe11111111111111111111111111111111';
const THEM = 'rThem111111111111111111111111111111';

describe('shouldLookupAdvisorySender', () => {
    it('hides incoming Payment from a third party', () => {
        expect(
            shouldLookupAdvisorySender(
                { TransactionType: TransactionTypes.Payment, Account: THEM, Destination: ME },
                ME,
                false,
            ),
        ).toBe(true);
    });

    it('does not hide Payment I sent', () => {
        expect(
            shouldLookupAdvisorySender(
                { TransactionType: TransactionTypes.Payment, Account: ME, Destination: THEM },
                ME,
                false,
            ),
        ).toBe(false);
    });

    it('hides incoming CheckCreate and EscrowCreate from a third party', () => {
        expect(
            shouldLookupAdvisorySender(
                { TransactionType: TransactionTypes.CheckCreate, Account: THEM, Destination: ME },
                ME,
                false,
            ),
        ).toBe(true);
        expect(
            shouldLookupAdvisorySender(
                { TransactionType: TransactionTypes.EscrowCreate, Account: THEM, Destination: ME },
                ME,
                false,
            ),
        ).toBe(true);
    });

    it('does not hide CheckCreate not destined to me', () => {
        expect(
            shouldLookupAdvisorySender(
                { TransactionType: TransactionTypes.CheckCreate, Account: THEM, Destination: THEM },
                ME,
                false,
            ),
        ).toBe(false);
    });

    it('hides CheckCancel / EscrowCancel / EscrowFinish by a third party', () => {
        expect(
            shouldLookupAdvisorySender(
                { TransactionType: TransactionTypes.CheckCancel, Account: THEM },
                ME,
                false,
            ),
        ).toBe(true);
        expect(
            shouldLookupAdvisorySender(
                { TransactionType: TransactionTypes.EscrowCancel, Account: THEM },
                ME,
                false,
            ),
        ).toBe(true);
        expect(
            shouldLookupAdvisorySender(
                { TransactionType: TransactionTypes.EscrowFinish, Account: THEM },
                ME,
                false,
            ),
        ).toBe(true);
    });

    it('does not hide CheckCancel / EscrowCancel I submitted', () => {
        expect(
            shouldLookupAdvisorySender(
                { TransactionType: TransactionTypes.CheckCancel, Account: ME },
                ME,
                false,
            ),
        ).toBe(false);
        expect(
            shouldLookupAdvisorySender(
                { TransactionType: TransactionTypes.EscrowCancel, Account: ME },
                ME,
                false,
            ),
        ).toBe(false);
    });

    it('does not hide TrustSet from a third party', () => {
        expect(
            shouldLookupAdvisorySender(
                { TransactionType: TransactionTypes.TrustSet, Account: THEM },
                ME,
                false,
            ),
        ).toBe(false);
    });
});
