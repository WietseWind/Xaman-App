/** Cache identity uses the saved rail, since custom rails can share a protocol NetworkID. */
export const accountDetailsId = (address: string, network: { id: { toString(): string } }): string =>
    `${address}.network.${network.id.toString()}`;
