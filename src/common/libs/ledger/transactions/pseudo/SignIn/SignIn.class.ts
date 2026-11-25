import BasePseudoTransaction from '@common/libs/ledger/transactions/pseudo/base';

/* Types ==================================================================== */
import { TransactionJson } from '@common/libs/ledger/types/transaction';
import { PseudoTransactionTypes } from '@common/libs/ledger/types/enums';

/* Class ==================================================================== */
class SignIn extends BasePseudoTransaction {
    public static Type = PseudoTransactionTypes.SignIn as const;
    public readonly Type = SignIn.Type;

    constructor(tx?: TransactionJson) {
        super(tx);
    }

    unsignableFields(): string[] {
        const tx = this.JsonForSigning;
        // accountlib recognizes Channel + Amount without TransactionType as a
        // claim. A login must never change into a claim through its extra fields.
        return tx.Channel && tx.Amount ? ['Channel', 'Amount'] : super.unsignableFields();
    }
}

/* Export ==================================================================== */
export default SignIn;
