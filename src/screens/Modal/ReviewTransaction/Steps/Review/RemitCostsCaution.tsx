import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import NetworkService from '@services/NetworkService';
import { Remit } from '@common/libs/ledger/transactions';
import { InfoMessage } from '@components/General/InfoMessage';
import { Spacer } from '@components/General/Spacer';
import Localize from '@locale';
import { AppStyles } from '@theme';

import { assumedRemitCosts, remitCostAmounts, remitCosts, remitCostsAny, RemitCosts } from './remitCosts';
import styles from './styles';

const LINE = {
    activation: { id: 'remit-pays-activation', text: () => Localize.t('payload.remitPaysActivation') },
    trustLines: {
        id: 'remit-pays-trust-lines',
        text: (count: number) => Localize.t('payload.remitPaysTrustLines', { count }),
    },
    uriTokens: {
        id: 'remit-pays-uritokens',
        text: (count: number) => Localize.t('payload.remitPaysURITokens', { count }),
    },
};

/**
 * Above the slide button of a Remit: what the Remit sends along to cover reserves at the
 * destination, besides what it sends. The total, and one line for each part that applies, with
 * the amounts under each other; a Remit that pays for nothing more shows nothing.
 *
 * Until the ledger answered, everything that can apply is listed.
 */
const RemitCostsCaution = ({ transaction }: { transaction: Remit }) => {
    const [costs, setCosts] = useState<RemitCosts>(() => assumedRemitCosts(transaction));

    // the parts of the Remit that decide the costs
    const parts = JSON.stringify([
        transaction.Destination,
        transaction.Amounts,
        transaction.URITokenIDs,
        !!transaction.MintURIToken,
    ]);

    useEffect(() => {
        let current = true;
        setCosts(assumedRemitCosts(transaction));
        remitCosts(transaction)
            .then((known) => {
                if (current) setCosts(known);
            })
            .catch(() => {
                // the assumed costs stay
            });
        return () => {
            current = false;
        };
        // `parts` stands for the transaction: the same Remit object can change while it is reviewed
    }, [parts]);

    if (!remitCostsAny(costs)) return null;

    const asset = NetworkService.getNativeAsset();
    const { total, lines } = remitCostAmounts(costs, NetworkService.getNetworkReserve());
    // the amounts are in a monospace font: the same length puts the decimal points under each other
    const width = Math.max(...lines.map((line) => line.amount.length));

    return (
        <>
            <View testID="remit-pays-reserves-warning">
                <InfoMessage type="warning">
                    <Text testID="remit-pays-total" style={[AppStyles.subtext, AppStyles.bold, AppStyles.colorOrange]}>
                        {Localize.t('payload.remitPaysReserves', { amount: total, asset })}
                    </Text>
                    <View style={styles.remitCostLines}>
                        {lines.map((line) => (
                            <View key={line.kind} style={styles.remitCostLine}>
                                <Text style={[AppStyles.monoSubText, AppStyles.colorOrange, styles.remitCostAmount]}>
                                    {`${line.amount.padStart(width, ' ')} ${asset}`}
                                </Text>
                                <Text
                                    testID={LINE[line.kind].id}
                                    style={[AppStyles.subtext, AppStyles.colorOrange, styles.remitCostLabel]}
                                >
                                    {LINE[line.kind].text(line.count)}
                                </Text>
                            </View>
                        ))}
                    </View>
                </InfoMessage>
            </View>
            <Spacer size={15} />
        </>
    );
};

export default RemitCostsCaution;
