/** Prefer the hash the caller already had. Otherwise use the hash the node returned. */
export const submittedBlobHash = (callerHash?: string, txJsonHash?: string): string | undefined => {
    return callerHash || txJsonHash;
};
