import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { BaseTransaction } from '@common/libs/ledger/transactions/common';
import { InfoMessage } from '@components/General/InfoMessage';
import Localize from '@locale';
import { AppStyles } from '@theme';
import { readableHexText } from './extraFieldText';
import styles from './Templates/styles';

const ExtraFieldValue = ({ value }: { value: string }) => {
    const readable = readableHexText(value);
    const [showHex, setShowHex] = useState(false);
    if (!readable) {
        return <Text selectable style={styles.value}>{value}</Text>;
    }
    return (
        <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setShowHex((current) => !current)}
            testID={`extra-field-toggle-${value}`}
        >
            <Text selectable style={styles.value}>{showHex ? value : readable}</Text>
        </TouchableOpacity>
    );
};

const displayValue = (value: unknown) => (
    typeof value === 'string' ? <ExtraFieldValue value={value} /> : (
        <Text selectable style={styles.value}>{JSON.stringify(value, null, 2)}</Text>
    )
);

/** Hex that decodes as readable text can be tapped to show the original bytes. */
const ExtraFields = ({ transaction }: { transaction: BaseTransaction }) => {
    const fields = transaction.ExtraFields;
    if (!fields.length) return null;

    return (
        <View testID="payload-extra-fields">
            <Text style={styles.label}>{Localize.t('payload.extraFields')}</Text>
            <View style={styles.extraFieldsWarning}>
                <InfoMessage type="warning" label={Localize.t('payload.extraFieldsWarning')} />
            </View>
            {fields.map(({ name, value }) => (
                <View key={name} style={styles.contentBox}>
                    <Text selectable style={[styles.value, AppStyles.bold]}>{name}</Text>
                    {displayValue(value)}
                </View>
            ))}
        </View>
    );
};

export default ExtraFields;
