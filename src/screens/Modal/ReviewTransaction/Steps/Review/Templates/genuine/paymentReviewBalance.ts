/**
 * A payment with SendMax spends one currency and delivers another.
 * The spendable balance belongs next to the currency that leaves the account.
 */
export function paymentReceivesAmount(sendMax?: { currency?: string }): boolean {
    return Boolean(sendMax?.currency);
}

export function showSpendableNextToSendMax(
    sendMax?: { currency?: string },
    pathSelected?: boolean,
): boolean {
    // A chosen path replaces the Send Max row with the pay-with picker.
    return Boolean(sendMax?.currency) && !pathSelected;
}
