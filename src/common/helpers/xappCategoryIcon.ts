import type { Images } from './images';

const categoryIcons = new Map<string, keyof typeof Images>([
    ['onramp', 'IconXAppCategoryOnramp'],
    ['tools', 'IconXAppCategoryTools'],
    ['trading', 'IconXAppCategoryTrading'],
    ['defi', 'IconXAppCategoryDefi'],
    ['security', 'IconXAppCategorySecurity'],
    ['offramp', 'IconXAppCategoryOfframp'],
    ['games', 'IconXAppCategoryGames'],
    ['nfts', 'IconXAppCategoryNfts'],
    ['privacy', 'IconXAppCategoryPrivacy'],
    ['utilities', 'IconXAppCategoryUtilities'],
    ['tokens', 'IconXAppCategoryTokens'],
    ['social', 'IconXAppCategorySocial'],
    ['customer service', 'IconXAppCategorySupport'],
    ['support', 'IconXAppCategorySupport'],
]);

/** Backend category names stay unchanged for filtering; this selects artwork only. */
export const getXAppCategoryIcon = (category?: string | null): keyof typeof Images => {
    if (typeof category !== 'string') return 'IconXAppCategoryFallback';

    const normalized = category.trim().toLowerCase().replace(/\s+/g, ' ');
    return categoryIcons.get(normalized) ?? 'IconXAppCategoryFallback';
};
