import React from 'react';
import { View } from 'react-native';

import { InfoMessage } from '@components/General/InfoMessage';
import Localize from '@locale';
import { AppStyles } from '@theme';

/** Shown above the raw JSON. The JSON block itself is the developer view. */
const UniversalTransactionWarning = () => (
    <View testID="universal-transaction-warning" style={AppStyles.marginBottomSml}>
        <InfoMessage type="warning" label={Localize.t('payload.universalTransactionWarning')} />
    </View>
);

export default UniversalTransactionWarning;
