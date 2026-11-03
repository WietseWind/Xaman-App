import { engineResultFromTxLookup, recoverSubmitAfterSendError } from '../submitRecovery';

const HASH = '81F6A04CB7540EE7C9C2D71C81CCA18A1FBD4AFB7364ED7B952157F9D55375F6';

const network = {
    id: 21337,
    node: 'wss://xahau-test.net',
    type: 'Testnet',
    key: 'XAHAUTESTNET',
};

describe('submit recovery after a lost reply', () => {
    it('reads tesSUCCESS from an applied transaction', () => {
        expect(
            engineResultFromTxLookup({
                hash: HASH,
                meta: { TransactionResult: 'tesSUCCESS' },
            }),
        ).toBe('tesSUCCESS');
    });

    it('treats a found but not-yet-validated transaction as accepted', () => {
        expect(
            engineResultFromTxLookup({
                hash: HASH,
                TransactionType: 'Payment',
                validated: false,
            }),
        ).toBe('tesSUCCESS');
    });

    it('does not invent a result for txnNotFound', () => {
        expect(engineResultFromTxLookup({ error: 'txnNotFound' })).toBeUndefined();
    });

    it('keeps tesSUCCESS and the node when the submit reply was lost', async () => {
        const lookup = jest.fn().mockResolvedValue({
            hash: HASH,
            meta: { TransactionResult: 'tesSUCCESS' },
        });

        const result = await recoverSubmitAfterSendError({
            hash: HASH,
            error: new Error('Call timeout after 40 seconds'),
            network,
            lookup,
            wait: async () => undefined,
        });

        expect(result).toEqual({
            success: true,
            engineResult: 'tesSUCCESS',
            message: 'tesSUCCESS',
            hash: HASH,
            node: network.node,
            network,
        });
        expect(lookup).toHaveBeenCalledWith(HASH);
    });

    it('reports terQUEUED with the node when the hash is not in a closed ledger yet', async () => {
        const result = await recoverSubmitAfterSendError({
            hash: HASH,
            error: new Error('Class (connection) hard close requested'),
            network,
            lookup: async () => ({ error: 'txnNotFound' }),
            wait: async () => undefined,
        });

        expect(result.success).toBe(true);
        expect(result.engineResult).toBe('terQUEUED');
        expect(result.message).toBe('The transaction was not in a closed ledger yet.');
        expect(result.network).toEqual(network);
    });

    it('keeps telFAILED when the blob was never sent', async () => {
        const result = await recoverSubmitAfterSendError({
            hash: undefined,
            error: new Error('connection instance is not initiated in NetworkService class.'),
            network,
            lookup: jest.fn(),
            wait: async () => undefined,
        });

        expect(result.success).toBe(false);
        expect(result.engineResult).toBe('telFAILED');
        expect(result.network).toEqual(network);
    });

    it('retries while the new socket is still down, then uses the applied result', async () => {
        const lookup = jest
            .fn()
            .mockRejectedValueOnce(new Error('connection instance is not initiated in NetworkService class.'))
            .mockResolvedValueOnce({
                hash: HASH,
                meta: { TransactionResult: 'tecPATH_DRY' },
            });

        const result = await recoverSubmitAfterSendError({
            hash: HASH,
            error: new Error('Call timeout after 40 seconds'),
            network,
            lookup,
            wait: async () => undefined,
        });

        expect(lookup).toHaveBeenCalledTimes(2);
        expect(result.engineResult).toBe('tecPATH_DRY');
        expect(result.success).toBe(true);
        expect(result.network?.node).toBe(network.node);
    });
});
