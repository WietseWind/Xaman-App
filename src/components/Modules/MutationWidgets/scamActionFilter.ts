/**
 * Object-detail action buttons: on a reported-scam counterparty, hide accept /
 * cash / finish, but keep cancel / reject so the user can still clear the object.
 */
export const SCAM_HIDDEN_ACTIONS = new Set([
    'ACCEPT_NFTOKEN_OFFER',
    'SELL_NFTOKEN',
    'SELL_URITOKEN',
    'ACCEPT_URITOKEN_OFFER',
    'FINISH_ESCROW',
    'CASH_CHECK',
    'ACCEPT_CREDENTIAL',
]);

export const isReportedScamAdvisory = (advisory?: string): boolean => {
    return !!advisory && advisory !== 'UNKNOWN';
};

export const filterActionsForScamAdvisory = <T extends string>(actions: T[], advisory?: string): T[] => {
    if (!isReportedScamAdvisory(advisory)) {
        return actions;
    }
    return actions.filter((action) => !SCAM_HIDDEN_ACTIONS.has(action));
};
