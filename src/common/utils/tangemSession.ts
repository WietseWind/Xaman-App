import RNTangemSdk, { OptionsStartSession } from 'tangem-sdk-react-native';

/** Every Tangem card action starts here so attestation stays offline. */
export const startTangemOfflineSession = (
    options: Omit<OptionsStartSession, 'attestationMode'> = {},
): Promise<void> => {
    return RNTangemSdk.startSession({
        ...options,
        attestationMode: 'offline',
    });
};
