import PermissionedDomainDelete from './PermissionedDomainDelete.class';

/* Types ==================================================================== */
import { ValidationType } from '@common/libs/ledger/factory/types';

/* Validation ==================================================================== */
const PermissionedDomainDeleteValidation: ValidationType<PermissionedDomainDelete> = (): Promise<void> => {
    // TODO: add validation
    return new Promise((resolve) => {
        resolve();
    });
};

/* Export ==================================================================== */
export default PermissionedDomainDeleteValidation;
