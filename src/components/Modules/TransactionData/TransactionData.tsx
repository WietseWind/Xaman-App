import React from 'react';
import { View } from 'react-native';

import { BaseTransaction } from '@common/libs/ledger/transactions/common';
import JsonTree from '@components/General/JsonTree/JsonTree';
import { AppStyles } from '@theme';

/** Raw signed JSON. The "no specific screen" warning sits above this block, not inside it. */
const TransactionData = ({ transaction, history = false }: { transaction: BaseTransaction; history?: boolean }) => (
    <View testID="universal-transaction-data" style={AppStyles.paddingSml}>
        <JsonTree
            data={history ? transaction.JsonRaw : transaction.JsonForSigning}
            noDefaultCollapse={Number.MAX_SAFE_INTEGER}
            showFullValues
        />
    </View>
);

export default TransactionData;
