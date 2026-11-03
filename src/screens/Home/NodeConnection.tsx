import React, { useEffect, useState } from 'react';
import { Text, View, ViewStyle } from 'react-native';

import NetworkService, { NetworkStateStatus } from '@services/NetworkService';
import Localize from '@locale';
import styles from './styles';

interface Props {
    fallbackEndpoint: string;
}

const readConnection = (fallbackEndpoint: string) => ({
    endpoint: NetworkService.getConnectedEndpoint() || fallbackEndpoint,
    status: NetworkService.getConnectionStatus(),
});

const NodeConnection = ({ fallbackEndpoint }: Props) => {
    const [connection, setConnection] = useState(() => readConnection(fallbackEndpoint));

    useEffect(() => {
        const updateConnection = () => {
            const next = readConnection(fallbackEndpoint);
            setConnection(previous => (
                previous.endpoint === next.endpoint && previous.status === next.status ? previous : next
            ));
        };

        NetworkService.on('stateChange', updateConnection);
        NetworkService.on('connect', updateConnection);
        updateConnection();

        return () => {
            NetworkService.off('stateChange', updateConnection);
            NetworkService.off('connect', updateConnection);
        };
    }, [fallbackEndpoint]);

    const { endpoint, status } = connection;
    let label = Localize.t('global.disconnected');
    let indicatorStyle: ViewStyle = styles.networkDisconnected;

    if (status === NetworkStateStatus.Connected) {
        label = Localize.t('global.connected');
        indicatorStyle = styles.networkConnected;
    } else if (status === NetworkStateStatus.Connecting) {
        label = Localize.t('global.connecting');
        indicatorStyle = styles.networkConnecting;
    }

    return (
        <View
            testID="node-connection"
            accessible
            accessibilityLabel={`${label}: ${endpoint}`}
            style={styles.networkDetailsContainer}
        >
            <View style={[styles.networkStatusIndicator, indicatorStyle]} />
            <Text numberOfLines={1} ellipsizeMode="middle" style={styles.networkTextContent}>
                {endpoint.replace(/^wss?:\/\//i, '').replace(/\/$/, '')}
            </Text>
            <Text numberOfLines={1} style={styles.networkTextLabel}>{label}</Text>
        </View>
    );
};

export default NodeConnection;
