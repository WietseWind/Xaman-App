import React from 'react';
import { Text, View } from 'react-native';

import { BaseTransaction } from '@common/libs/ledger/transactions/common';
import { InfoMessage } from '@components/General/InfoMessage';
import Localize from '@locale';
import { AppStyles } from '@theme';
import styles from './Templates/styles';

/** Values stay in their ledger representation: hex stays hex, large integers stay strings. */
const ExtraFields = ({ transaction }: { transaction: BaseTransaction }) => {
    const fields = transaction.ExtraFields;
    if (!fields.length) return null;

    return (
        <View testID="payload-extra-fields">
            <Text style={styles.label}>{Localize.t('payload.extraFields')}</Text>
            <InfoMessage type="warning" label={Localize.t('payload.extraFieldsWarning')} />
            {fields.map(({ name, value }) => (
                <View key={name} style={styles.contentBox}>
                    <Text selectable style={[styles.value, AppStyles.bold]}>{name}</Text>
                    <Text selectable style={styles.value}>
                        {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                    </Text>
                </View>
            ))}
        </View>
    );
};

export default ExtraFields;
