const SITE_HOSTS = ['xumm.app', 'xaman.app', 'help.xumm.app', 'help.xaman.app'];
const TANGEM_HOSTS = ['xumm.app', 'xaman.app'];

/**
 * React Native 0.74's URL class throws on protocol, hostname and pathname.
 * Parse only the https pieces these checks need, so the result does not
 * depend on which URL implementation the runtime installed.
 */
export const parseHttpsUrl = (content: string): { hostname: string; pathname: string } | undefined => {
    if (typeof content !== 'string') {
        return undefined;
    }
    const value = content.trim();
    if (!/^https:\/\//i.test(value)) {
        return undefined;
    }

    const rest = value.slice('https://'.length);
    const splitAt = rest.search(/[/?#]/);
    const authority = splitAt === -1 ? rest : rest.slice(0, splitAt);
    const pathAndMore = splitAt === -1 ? '/' : rest.slice(splitAt);
    if (!authority || authority.includes('@') || authority.includes('\\') || /\s/.test(authority)) {
        return undefined;
    }

    let host = authority;
    const colon = host.lastIndexOf(':');
    if (colon !== -1) {
        const port = host.slice(colon + 1);
        if (!/^\d+$/.test(port)) {
            return undefined;
        }
        host = host.slice(0, colon);
    }
    host = host.toLowerCase().replace(/\.$/, '');
    if (!host || host.includes('..') || !/^[a-z0-9.-]+$/.test(host)) {
        return undefined;
    }

    const queryAt = pathAndMore.search(/[?#]/);
    let pathname = queryAt === -1 ? pathAndMore : pathAndMore.slice(0, queryAt);
    if (!pathname.startsWith('/')) {
        pathname = `/${pathname}`;
    }
    return { hostname: host, pathname };
};

export const isTrustedXamanUrl = (content: string): boolean => {
    const parsed = parseHttpsUrl(content);
    return !!parsed && SITE_HOSTS.includes(parsed.hostname);
};

export const isXamanTangemUrl = (content: string): boolean => {
    const parsed = parseHttpsUrl(content);
    if (!parsed || !TANGEM_HOSTS.includes(parsed.hostname)) {
        return false;
    }
    return parsed.pathname === '/tangem' || parsed.pathname.startsWith('/tangem/');
};

/** Documents the prefix check this helper replaces. Lookalike hosts pass it. */
export const matchesLegacyXamanPrefix = (content: string): boolean => {
    return ['https://xumm.app', 'https://help.xumm.app', 'https://xaman.app', 'https://help.xaman.app'].some((url) =>
        content.startsWith(url),
    );
};
