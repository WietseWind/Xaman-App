const TANGEM_CARD = '💳';
const TANGEM_TYPE = 'Tangem';

export const accountListLabel = (account: { type?: string; label?: string | null }): string => {
    const label = account.label ?? '';

    if (account.type !== TANGEM_TYPE || label.includes(TANGEM_CARD)) {
        return label;
    }

    return `${TANGEM_CARD} ${label}`;
};

/** Sort key ignores one leading card emoji, then starts at the first letter or number. */
export const accountLabelSortKey = (label: string): string => {
    const withoutLeadingCard = label.replace(/^💳\uFE0F?\s*/, '');
    const alnumAt = withoutLeadingCard.search(/[0-9A-Za-z\u00C0-\u024F\u0400-\u04FF]/);

    if (alnumAt < 0) {
        return withoutLeadingCard;
    }

    return withoutLeadingCard.slice(alnumAt);
};

export const compareAccountLabels = (left: string, right: string): number => {
    return accountLabelSortKey(left).localeCompare(accountLabelSortKey(right), undefined, {
        numeric: true,
        sensitivity: 'base',
    });
};

export const sortAccountsByLabel = <T extends { type?: string; label?: string | null }>(accounts: T[]): T[] => {
    return [...accounts].sort((left, right) => {
        return compareAccountLabels(accountListLabel(left), accountListLabel(right));
    });
};
