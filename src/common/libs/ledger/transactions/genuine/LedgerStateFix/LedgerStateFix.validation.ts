import LedgerStateFix from './LedgerStateFix.class';

/* Types ==================================================================== */
import { ValidationType } from '@common/libs/ledger/factory/types';

/* Validation ==================================================================== */
const LedgerStateFixValidation: ValidationType<LedgerStateFix> = (): Promise<void> => {
    // TODO: add validation
    return new Promise((resolve) => {
        resolve();
    });
};

/* Export ==================================================================== */
export default LedgerStateFixValidation;
