type AccountLike = { isValid?: () => boolean; address?: string } | undefined;

/** Ignore an account update until a selected account exists and matches it. */
export const shouldApplyAccountUpdate = (updated: AccountLike, selected: AccountLike): boolean => {
    return !!(updated?.isValid?.() && selected?.address && updated.address === selected.address);
};
