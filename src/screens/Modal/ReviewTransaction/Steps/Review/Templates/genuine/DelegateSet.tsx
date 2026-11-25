import React from 'react';

import { DelegateSet } from '@common/libs/ledger/transactions';
import DelegationDetails from '@components/Modules/DelegationDetails';
import { NetworkDefinitions } from '@common/libs/ledger/utils/normalizeDefinitions';
import { TemplateProps } from '../types';

export interface Props extends Omit<TemplateProps, 'transaction'> {
    transaction: DelegateSet;
}

const DelegateSetTemplate = ({ transaction, source }: Props) => {
    const granting = !!transaction.Permissions?.length;
    return (
        <DelegationDetails
            owner={transaction.Account || source.address}
            authorize={transaction.Authorize}
            permissions={granting ? transaction.Permissions : transaction.revokedPermissions}
            transactionTypes={
                (transaction.SigningDefinitions as NetworkDefinitions)?.rawDefinitions?.TRANSACTION_TYPES || {}
            }
            nativeAsset={(transaction.SigningDefinitions as NetworkDefinitions)?.rawDefinitions?.native_currency_code}
            mode={granting ? 'grant' : 'revoke'}
        />
    );
};

export default DelegateSetTemplate;
