/**
 * Which hosts still receive the xApp one-time token in the User-Agent.
 *
 * Android (XamanOttScope.java) and iOS (XamanOttSchemeHandler.m) implement
 * this same policy. Change all three together.
 *
 * Own hosts (the sandbox and the detect redirect) always keep the token.
 * The first document on any other host becomes the xApp site. Every later
 * request to that domain and its subdomains keeps the token, including
 * reloads and navigations to other pages. Direct redirects of that first
 * document are part of the same allowance. Every other domain has it removed.
 */

export const XAPP_OTT_OWN_SUFFIXES = ['xaman.app', 'xumm.app', 'xrpl-labs.com'] as const;

// Longest match wins. These are shared suffixes where the label before the
// suffix is the real site, so one xApp cannot cover every tenant.
const PUBLIC_SUFFIXES = [
    's3.amazonaws.com',
    'amazonaws.com',
    'azurewebsites.net',
    'cloudfront.net',
    'firebaseapp.com',
    'github.io',
    'gitlab.io',
    'herokuapp.com',
    'netlify.app',
    'pages.dev',
    'vercel.app',
    'web.app',
    'workers.dev',
    'com.au',
    'net.au',
    'org.au',
    'co.jp',
    'co.nz',
    'co.uk',
    'org.uk',
    'ac.uk',
    'com.br',
    'com.mx',
    'com.sg',
    'com.tr',
    'co.za',
];

const OTT_PATTERN = /\s*\(ott:[^)]*\)/g;

export type OttObservation = {
    host: string | null;
    path?: string | null;
    document: boolean;
    redirect: boolean;
};

export function normalizeHost(host: string | null | undefined): string | null {
    if (!host) {
        return null;
    }
    let value = host.trim().toLowerCase();
    if (value.endsWith('.')) {
        value = value.slice(0, -1);
    }
    const colon = value.lastIndexOf(':');
    if (colon > -1 && value.indexOf(':') === colon && /^\d+$/.test(value.slice(colon + 1))) {
        value = value.slice(0, colon);
    }
    return value || null;
}

export function isOwnXappHost(host: string | null | undefined): boolean {
    const normalized = normalizeHost(host);
    if (!normalized) {
        return false;
    }
    return XAPP_OTT_OWN_SUFFIXES.some((suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`));
}

export function isXappDetectLaunch(path: string | null | undefined): boolean {
    return (path || '').includes('/detect/xapp');
}

function isIpHost(host: string): boolean {
    return host.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/** Registrable site: example.com, example.co.uk, or tenant.github.io. */
export function xappSiteRoot(host: string | null | undefined): string | null {
    const normalized = normalizeHost(host);
    if (!normalized) {
        return null;
    }
    if (isIpHost(normalized) || !normalized.includes('.')) {
        return normalized;
    }
    let suffix = '';
    for (const candidate of PUBLIC_SUFFIXES) {
        if ((normalized === candidate || normalized.endsWith(`.${candidate}`)) && candidate.length > suffix.length) {
            suffix = candidate;
        }
    }
    if (suffix) {
        if (normalized === suffix) {
            return normalized;
        }
        const remainder = normalized.slice(0, -(suffix.length + 1));
        const left = remainder.split('.').pop();
        return left ? `${left}.${suffix}` : normalized;
    }
    const labels = normalized.split('.');
    return labels.slice(-2).join('.');
}

export function sameXappSite(host: string | null | undefined, allowedHost: string | null | undefined): boolean {
    const left = xappSiteRoot(host);
    const right = xappSiteRoot(allowedHost);
    return !!left && left === right;
}

export function stripOttUserAgent(userAgent: string | null | undefined): string {
    if (!userAgent) {
        return '';
    }
    return userAgent.replace(OTT_PATTERN, '');
}

export class XappOttScope {
    pinnedHost: string | null = null;

    readonly allowedHosts = new Set<string>();

    chainOpen = false;

    expectingRedirect = false;

    reset(): void {
        this.pinnedHost = null;
        this.allowedHosts.clear();
        this.chainOpen = false;
        this.expectingRedirect = false;
    }

    keeps(host: string | null | undefined): boolean {
        const normalized = normalizeHost(host);
        if (!normalized) {
            return true;
        }
        return isOwnXappHost(normalized) || this.matchesAllowed(normalized);
    }

    private matchesAllowed(host: string): boolean {
        for (const allowed of this.allowedHosts) {
            if (sameXappSite(host, allowed)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Same-task redirect (iOS scheme handler). The next request is not a new
     * observation, so the target host is recorded here.
     */
    noteRedirect(fromHost: string | null | undefined, toHost: string | null | undefined, document: boolean): void {
        if (!document) {
            return;
        }
        const to = normalizeHost(toHost);
        if (!to || isOwnXappHost(to)) {
            return;
        }
        const from = normalizeHost(fromHost);
        const fromKnown = !!from && (isOwnXappHost(from) || this.matchesAllowed(from) || this.chainOpen);
        if (!fromKnown) {
            return;
        }
        this.allowedHosts.add(to);
        this.pinnedHost = to;
        this.chainOpen = true;
        this.expectingRedirect = true;
    }

    noteDocumentStatus(status: number): void {
        if (status >= 300 && status < 400) {
            this.expectingRedirect = true;
            return;
        }
        this.chainOpen = false;
        this.expectingRedirect = false;
    }

    /** True when this request must still carry the token. */
    observe(input: OttObservation): boolean {
        const host = normalizeHost(input.host);
        if (!host) {
            return true;
        }
        const path = input.path || '';

        if (isOwnXappHost(host)) {
            if (input.document && !input.redirect && isXappDetectLaunch(path)) {
                this.reset();
            }
            return true;
        }

        if (this.matchesAllowed(host)) {
            // A subresource from the xApp host means that document has started.
            if (!input.document && this.chainOpen && !this.expectingRedirect) {
                this.chainOpen = false;
            }
            return true;
        }

        if (input.document) {
            const first = this.pinnedHost == null && this.allowedHosts.size === 0;
            const follow = this.chainOpen && (input.redirect || this.expectingRedirect);
            if (first || follow) {
                this.allowedHosts.add(host);
                this.pinnedHost = host;
                this.chainOpen = true;
                this.expectingRedirect = false;
                return true;
            }
            return false;
        }

        return false;
    }
}
