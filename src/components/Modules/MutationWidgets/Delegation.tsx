import React from 'react';
import { View } from 'react-native';

import { LedgerEntryTypes, TransactionTypes } from '@common/libs/ledger/types/enums';
import DelegationDetails from '@components/Modules/DelegationDetails';
import { Props } from './types';
import styles from './styles';

const Delegation = ({ item }: Props) => {
    if (item.Type !== LedgerEntryTypes.Delegate && item.Type !== TransactionTypes.DelegateSet) return null;
    const transaction = item as any;
    const types = item.Type === LedgerEntryTypes.Delegate ? item.PermissionTransactionTypes
        : transaction.SigningDefinitions?.rawDefinitions?.TRANSACTION_TYPES || {};
    const permissions = transaction.Permissions || [];
    const nativeAsset = item.Type === LedgerEntryTypes.Delegate ? item.PermissionNativeAsset
        : transaction.SigningDefinitions?.rawDefinitions?.native_currency_code;
    return (
        <View style={styles.detailContainer}>
            <DelegationDetails owner={transaction.Account} authorize={transaction.Authorize}
                permissions={permissions} transactionTypes={types} nativeAsset={nativeAsset}
                mode={item.Type === LedgerEntryTypes.Delegate ? 'object' : permissions.length ? 'grant' : 'revoke'} />
        </View>
    );
};

export default Delegation;
