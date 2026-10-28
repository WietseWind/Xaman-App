import React from 'react';
import { View } from 'react-native';

import { BaseTransaction } from '@common/libs/ledger/transactions/common';
import { InfoMessage } from '@components/General/InfoMessage';
import JsonTree from '@components/General/JsonTree/JsonTree';
import Localize from '@locale';
import { AppStyles } from '@theme';

/** Review the signed fields; history retains the complete ledger JSON, even with older local definitions. */
const TransactionData = ({ transaction, history = false }: { transaction: BaseTransaction; history?: boolean }) => (
    <View testID="universal-transaction-data" style={AppStyles.paddingSml}>
        <InfoMessage type="warning" label={Localize.t('payload.universalTransactionWarning')} />
        <JsonTree
            data={history ? transaction.JsonRaw : transaction.JsonForSigning}
            noDefaultCollapse={Number.MAX_SAFE_INTEGER}
            showFullValues
        />
    </View>
);

export default TransactionData;
