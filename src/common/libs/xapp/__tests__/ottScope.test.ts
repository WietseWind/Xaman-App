import { isOwnXappHost, isXappDetectLaunch, stripOttUserAgent, XappOttScope } from '../ottScope';

const realFs = jest.requireActual('fs') as {
    readFileSync: (file: string, encoding: 'utf8') => string;
};
const realPath = jest.requireActual('path') as {
    join: (...parts: string[]) => string;
};

describe('xApp OTT host scope', () => {
    it('treats sandbox domains and their subdomains as own hosts', () => {
        expect(isOwnXappHost('xaman.app')).toBe(true);
        expect(isOwnXappHost('www.xaman.app')).toBe(true);
        expect(isOwnXappHost('Xumm.APP')).toBe(true);
        expect(isOwnXappHost('a.b.xrpl-labs.com.')).toBe(true);
        expect(isOwnXappHost('notxaman.app')).toBe(false);
        expect(isOwnXappHost('xaman.app.evil.com')).toBe(false);
        expect(isOwnXappHost('evil-xrpl-labs.com')).toBe(false);
        expect(isOwnXappHost(null)).toBe(false);
    });

    it('recognises the detect launch path', () => {
        expect(isXappDetectLaunch('/detect/xapp:xaman.swap')).toBe(true);
        expect(isXappDetectLaunch('/app/webviews/shell')).toBe(false);
    });

    it('removes only the ott marker from the user agent', () => {
        expect(stripOttUserAgent('xumm/xapp:310 (ott:secret-value)')).toBe('xumm/xapp:310');
        expect(stripOttUserAgent('xumm/xapp:310')).toBe('xumm/xapp:310');
        expect(stripOttUserAgent('xumm/xapp:310 (ott:a) (ott:b)')).toBe('xumm/xapp:310');
        expect(stripOttUserAgent(null)).toBe('');
    });

    it('keeps the token on the sandbox and on the xApp host, not on a CDN', () => {
        const scope = new XappOttScope();

        expect(
            scope.observe({ host: 'xaman.app', path: '/detect/xapp:xaman.swap', document: true, redirect: false }),
        ).toBe(true);
        expect(scope.observe({ host: 'xumm.app', path: '/app/webviews/shell', document: true, redirect: true })).toBe(
            true,
        );
        expect(scope.observe({ host: 'fonts.googleapis.com', path: '/css', document: false, redirect: false })).toBe(
            false,
        );
        expect(scope.observe({ host: 'xapp.example.com', path: '/', document: true, redirect: false })).toBe(true);
        expect(scope.observe({ host: 'xapp.example.com', path: '/api', document: false, redirect: false })).toBe(true);
        expect(scope.observe({ host: 'cdn.jsdelivr.net', path: '/app.js', document: false, redirect: false })).toBe(
            false,
        );
        expect(scope.observe({ host: 'xumm.app', path: '/app/asset.js', document: false, redirect: false })).toBe(true);
        expect(scope.observe({ host: 'ads.network', path: '/', document: true, redirect: false })).toBe(false);
    });

    it('follows direct redirects of the first xApp document and then stops', () => {
        const scope = new XappOttScope();

        scope.observe({ host: 'xaman.app', path: '/detect/xapp:a', document: true, redirect: false });
        expect(scope.observe({ host: 'hop.example', path: '/', document: true, redirect: true })).toBe(true);
        expect(scope.observe({ host: 'fonts.gstatic.com', path: '/a.woff', document: false, redirect: false })).toBe(
            false,
        );
        expect(scope.observe({ host: 'real.example', path: '/app', document: true, redirect: true })).toBe(true);
        expect(scope.keeps('hop.example')).toBe(true);
        expect(scope.keeps('real.example')).toBe(true);
        expect(scope.observe({ host: 'real.example', path: '/app.js', document: false, redirect: false })).toBe(true);
        expect(scope.observe({ host: 'later.example', path: '/', document: true, redirect: true })).toBe(false);
    });

    it('keeps a same-task redirect target and drops it after the next launch', () => {
        const scope = new XappOttScope();

        scope.observe({ host: 'xaman.app', path: '/detect/xapp:a', document: true, redirect: false });
        scope.noteRedirect('xaman.app', 'app.example.com', true);
        expect(scope.keeps('app.example.com')).toBe(true);
        expect(scope.keeps('cdn.example.com')).toBe(false);
        scope.noteRedirect('app.example.com', 'cdn.example.com', false);
        expect(scope.keeps('cdn.example.com')).toBe(false);
        scope.noteDocumentStatus(200);
        expect(scope.keeps('app.example.com')).toBe(true);

        scope.observe({ host: 'xaman.app', path: '/detect/xapp:b', document: true, redirect: false });
        expect(scope.keeps('app.example.com')).toBe(false);
        expect(scope.observe({ host: 'second.example', path: '/', document: true, redirect: true })).toBe(true);
    });

    it('does not let a CDN request close the redirect chain', () => {
        const scope = new XappOttScope();

        scope.observe({ host: 'xaman.app', path: '/detect/xapp:a', document: true, redirect: false });
        scope.noteRedirect('xaman.app', 'app.example.com', true);
        expect(scope.observe({ host: 'fonts.googleapis.com', path: '/a.css', document: false, redirect: false })).toBe(
            false,
        );
        expect(scope.observe({ host: 'www.example.com', path: '/', document: true, redirect: false })).toBe(true);
        expect(scope.keeps('www.example.com')).toBe(true);
    });

    it('ships the same own-host list and token pattern in the native webview code', () => {
        const root = realPath.join(__dirname, '../../../../..');
        const javaPath = realPath.join(
            root,
            'node_modules/react-native-webview/android/src/main/java',
            'com/reactnativecommunity/webview/XamanOttScope.java',
        );
        const java = realFs.readFileSync(javaPath, 'utf8');
        const objc = realFs.readFileSync(
            realPath.join(root, 'node_modules/react-native-webview/apple/XamanOttSchemeHandler.m'),
            'utf8',
        );

        for (const source of [java, objc]) {
            expect(source).toContain('xaman.app');
            expect(source).toContain('xumm.app');
            expect(source).toContain('xrpl-labs.com');
            expect(source).toContain('(ott:');
            expect(source).toContain('/detect/xapp');
        }
    });
});
