// Current external-holding integrations expose XRPL Mainnet positions.
// Ledger trust lines and MPTs are independent of this capability.
export const supportsExternalAssets = (networkKey?: string): boolean => networkKey === 'MAINNET';

export const EXTERNAL_ASSET_LIMIT = '-9999999999';
