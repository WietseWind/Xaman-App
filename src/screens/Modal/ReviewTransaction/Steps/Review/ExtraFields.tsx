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
        <Text selectable style={styles.value}>{JSON.stringify(value)}</Text>
    )
);

/** One row per leaf. An unimplemented object or array is still shown field by field. */
const fieldRows = (name: string, value: unknown): { name: string; value: unknown }[] => {
    if (Array.isArray(value)) {
        if (!value.length) return [{ name, value: '[]' }];
        return value.flatMap((item, index) => fieldRows(`${name}[${index}]`, item));
    }
    if (value !== null && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>);
        if (!entries.length) return [{ name, value: '{}' }];
        return entries.flatMap(([key, child]) => fieldRows(`${name}.${key}`, child));
    }
    return [{ name, value }];
};

/**
 * Hex that decodes as readable text can be tapped to show the original bytes.
 * An unknown transaction type already shows the no-screen warning, so it does not
 * repeat the extra-fields title or the "cannot fully decode" warning.
 */
const ExtraFields = ({ transaction, omitIntro = false }: { transaction: BaseTransaction; omitIntro?: boolean }) => {
    const fields = transaction.ExtraFields;
    if (!fields.length) return null;

    return (
        <View testID="payload-extra-fields">
            {!omitIntro && (
                <>
                    <Text style={styles.label}>{Localize.t('payload.extraFields')}</Text>
                    <View style={styles.extraFieldsWarning}>
                        <InfoMessage type="warning" label={Localize.t('payload.extraFieldsWarning')} />
                    </View>
                </>
            )}
            {fields.flatMap(({ name, value }) => fieldRows(name, value)).map((field) => (
                <View key={field.name} style={styles.contentBox}>
                    <Text selectable style={[styles.value, AppStyles.bold]}>{field.name}</Text>
                    {displayValue(field.value)}
                </View>
            ))}
        </View>
    );
};

export default ExtraFields;
