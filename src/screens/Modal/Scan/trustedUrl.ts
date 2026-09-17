const SITE_HOSTS = ['xumm.app', 'xaman.app', 'help.xumm.app', 'help.xaman.app'];
const TANGEM_HOSTS = ['xumm.app', 'xaman.app'];

const hostnameOf = (content: string): string | undefined => {
    try {
        const parsed = new URL(content);
        if (parsed.protocol !== 'https:') {
            return undefined;
        }
        return parsed.hostname.toLowerCase();
    } catch {
        return undefined;
    }
};

export const isTrustedXamanUrl = (content: string): boolean => {
    const hostname = hostnameOf(content);
    return !!hostname && SITE_HOSTS.includes(hostname);
};

export const isXamanTangemUrl = (content: string): boolean => {
    try {
        const parsed = new URL(content);
        if (parsed.protocol !== 'https:') {
            return false;
        }
        if (!TANGEM_HOSTS.includes(parsed.hostname.toLowerCase())) {
            return false;
        }
        return parsed.pathname === '/tangem' || parsed.pathname.startsWith('/tangem/');
    } catch {
        return false;
    }
};

/** Documents the prefix check this helper replaces. Lookalike hosts pass it. */
export const matchesLegacyXamanPrefix = (content: string): boolean => {
    return ['https://xumm.app', 'https://help.xumm.app', 'https://xaman.app', 'https://help.xaman.app'].some((url) =>
        content.startsWith(url),
    );
};
