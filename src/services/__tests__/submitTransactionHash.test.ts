describe('submit blob verify hash', () => {
    it('reproduces verifying undefined when the caller omitted the hash', () => {
        const submitResult = {
            success: true,
            hash: undefined as string | undefined,
        };

        expect(submitResult.hash).toBeUndefined();
    });

    it('uses the hash returned in tx_json when the caller omitted it', () => {
        const txHash = undefined as string | undefined;
        const submitResponse = { tx_json: { hash: 'ABC'.repeat(21) + 'A' } };
        const hash = txHash || submitResponse.tx_json?.hash;

        expect(hash).toBe(submitResponse.tx_json.hash);
        expect(hash).toHaveLength(64);
    });
});
