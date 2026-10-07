/**
 * A submit reply can be lost when the socket dies after the node accepted the
 * blob. The catch used to report that as telFAILED and drop the node.
 */

export type SubmitNetworkDetails = {
    id: number;
    node: string;
    type: string;
    key: string;
};

export type RecoveredSubmit = {
    success: boolean;
    engineResult: string;
    message?: string;
    hash?: string;
    node: string;
    network: SubmitNetworkDetails;
};

export const submitNetworkFromConnection = (details: {
    networkId: number;
    node: string;
    type: string;
    networkKey: string;
}): SubmitNetworkDetails => {
    return {
        id: details.networkId,
        node: details.node,
        type: details.type,
        key: details.networkKey,
    };
};

/**
 * A `tx` lookup. Undefined when the hash is not on this network yet.
 * A found transaction uses its applied result, or tesSUCCESS while it is
 * still in the open ledger (the node already accepted the blob).
 */
export const engineResultFromTxLookup = (response: any): string | undefined => {
    if (!response || typeof response !== 'object') {
        return undefined;
    }
    if (response.error === 'txnNotFound') {
        return undefined;
    }
    if (typeof response.error === 'string' && response.error) {
        return undefined;
    }

    const applied = response.meta?.TransactionResult || response.metaData?.TransactionResult;
    if (typeof applied === 'string' && applied) {
        return applied;
    }
    if (typeof response.engine_result === 'string' && response.engine_result) {
        return response.engine_result;
    }
    if (response.hash || response.TransactionType || response.tx_json || response.tx) {
        return 'tesSUCCESS';
    }
    return undefined;
};

const sleep = (ms: number) => new Promise((resolve) => { setTimeout(resolve, ms); });

export const recoverSubmitAfterSendError = async ({
    hash,
    error,
    network,
    lookup,
    attempts = 3,
    pauseMs = 750,
    wait = sleep,
}: {
    hash?: string;
    error: { message?: string };
    network: SubmitNetworkDetails;
    lookup: (hash: string) => Promise<any>;
    attempts?: number;
    pauseMs?: number;
    wait?: (ms: number) => Promise<void>;
}): Promise<RecoveredSubmit> => {
    const carried = {
        hash,
        node: network.node,
        network,
    };

    if (hash) {
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            try {
                const response = await lookup(hash);
                if (response?.error === 'txnNotFound') {
                    break;
                }
                const engineResult = engineResultFromTxLookup(response);
                if (engineResult) {
                    return {
                        ...carried,
                        success: !engineResult.startsWith('tem'),
                        engineResult,
                        message:
                            response?.engine_result_message ||
                            response?.meta?.TransactionResult ||
                            response?.metaData?.TransactionResult ||
                            engineResult,
                    };
                }
            } catch {
                // The replacement socket may still be coming up.
            }
            if (attempt < attempts - 1) {
                await wait(pauseMs);
            }
        }
    }

    return {
        ...carried,
        success: false,
        engineResult: 'telFAILED',
        message: error?.message,
    };
};
