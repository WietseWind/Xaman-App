import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import NetworkService from '@services/NetworkService';
import { Remit } from '@common/libs/ledger/transactions';
import { InfoMessage } from '@components/General/InfoMessage';
import { Spacer } from '@components/General/Spacer';
import Localize from '@locale';
import { AppStyles } from '@theme';

import { assumedRemitCosts, remitCostAmounts, remitCosts, remitCostsAny, RemitCostsAnswer } from './remitCosts';
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

// the ledger did not answer (no connection, a time-out): ask again after this long
export const REMIT_COSTS_RETRY_MS = 5000;

const networkReserve = () => {
    try {
        return NetworkService.getNetworkReserve();
    } catch {
        return undefined;
    }
};

/**
 * Above the slide button of a Remit: what the Remit sends along to cover reserves at the
 * destination, besides what it sends. The total, and one line for each part that applies, with
 * the amounts under each other; a Remit that pays for nothing more shows nothing.
 *
 * Until the ledger answered, everything that can apply is listed and the total is "up to". When
 * the ledger does not answer, the question is asked again until it does: the caution is never
 * missing, never waits, and gets exact as soon as the connection is back.
 */
const RemitCostsCaution = ({ transaction }: { transaction: Remit }) => {
    const [answer, setAnswer] = useState<RemitCostsAnswer>(() => ({
        costs: assumedRemitCosts(transaction),
        known: false,
    }));

    // the parts of the Remit that decide the costs
    const parts = JSON.stringify([
        transaction.Destination,
        transaction.Amounts,
        transaction.URITokenIDs,
        !!transaction.MintURIToken,
    ]);

    useEffect(() => {
        let current = true;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const ask = () => {
            remitCosts(transaction)
                .catch((): RemitCostsAnswer => ({ costs: assumedRemitCosts(transaction), known: false }))
                .then((next) => {
                    if (!current) return;
                    setAnswer(next);
                    if (!next.known && transaction.Destination) {
                        timer = setTimeout(ask, REMIT_COSTS_RETRY_MS);
                    }
                });
        };

        setAnswer({ costs: assumedRemitCosts(transaction), known: false });
        ask();

        return () => {
            current = false;
            if (timer) clearTimeout(timer);
        };
        // `parts` stands for the transaction: the same Remit object can change while it is reviewed
    }, [parts]);

    const { costs, known } = answer;
    if (!remitCostsAny(costs)) return null;

    const asset = NetworkService.getNativeAsset();
    const amounts = remitCostAmounts(costs, networkReserve());
    const lines = amounts
        ? amounts.lines
        : (['activation', 'trustLines', 'uriTokens'] as const)
              .map((kind) => ({
                  kind,
                  count: kind === 'activation' ? Number(costs.activation) : costs[kind],
                  amount: '',
              }))
              .filter((line) => line.count > 0);
    // the amounts are in a monospace font: the same length puts the decimal points under each other
    const width = Math.max(...lines.map((line) => line.amount.length));

    return (
        <>
            <View testID="remit-pays-reserves-warning">
                <InfoMessage type="warning">
                    <Text
                        testID={known ? 'remit-pays-total' : 'remit-pays-total-at-most'}
                        style={[AppStyles.subtext, AppStyles.bold, AppStyles.colorOrange]}
                    >
                        {Localize.t(known ? 'payload.remitPaysReserves' : 'payload.remitPaysReservesUpTo', {
                            amount: amounts ? amounts.total : '?',
                            asset,
                        })}
                    </Text>
                    <View style={styles.remitCostLines}>
                        {lines.map((line) => (
                            <View key={line.kind} style={styles.remitCostLine}>
                                {!!amounts && (
                                    <Text
                                        style={[AppStyles.monoSubText, AppStyles.colorOrange, styles.remitCostAmount]}
                                    >
                                        {`${line.amount.padStart(width, ' ')} ${asset}`}
                                    </Text>
                                )}
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
