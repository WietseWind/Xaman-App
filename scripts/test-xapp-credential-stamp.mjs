import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = '../node_modules/react-native-webview/android/src/main/java/' +
    'com/reactnativecommunity/webview/RNCWebView.java';
const java = readFileSync(new URL(source, import.meta.url), 'utf8');
const start = java.indexOf('String script = ');
const end = java.indexOf('xamanOttScripts.put', start);
const literal = java.slice(start, end);
const script = literal
    .split('\n')
    .map((line) => {
        const match = line.match(/"((?:\\.|[^"\\])*)"/);
        return match ? JSON.parse(`"${match[1]}"`) : '';
    })
    .join('')
    .replace('return " + org.json.JSONObject.quote(xamanOttUserAgent) + ";', 'return "xumm-test";');

function check(condition, message) {
    if (!condition) throw new Error(message);
}

const sent = [];
function install(origin) {
    const sandbox = {
        location: new URL(origin),
        navigator: {},
        URL,
        Headers,
        Object,
        String,
        XMLHttpRequest: class {
            constructor() { this.headers = {}; this.withCredentials = false; }
            open(method, url) { this.method = method; this.url = url; }
            setRequestHeader(name, value) { this.headers[name] = value; }
            send(body) {
                sent.push({
                    kind: 'xhr',
                    method: this.method,
                    url: this.url,
                    body,
                    headers: { ...this.headers },
                    credentials: this.withCredentials,
                });
            }
        },
        window: {},
    };
    sandbox.window = sandbox;
    sandbox.fetch = (input, init) => {
        const headers = {};
        const headerSource = init?.headers || (typeof input === 'object' ? input.headers : undefined);
        if (headerSource && typeof headerSource.forEach === 'function') {
            headerSource.forEach((value, key) => { headers[key.toLowerCase()] = value; });
        } else if (headerSource && typeof headerSource === 'object') {
            Object.entries(headerSource).forEach(([key, value]) => {
                headers[key.toLowerCase()] = value;
            });
        }
        sent.push({
            kind: 'fetch',
            url: typeof input === 'string' ? input : input.url,
            method: (init && init.method) || (typeof input === 'object' && input.method) || 'GET',
            credentials: (init && init.credentials) || (typeof input === 'object' && input.credentials),
            headers,
            body: init && init.body,
        });
        return Promise.resolve();
    };
    vm.runInNewContext(script, sandbox);
    return sandbox;
}

const page = install('https://app.example/');
const request = new Request('https://app.example/session', {
    headers: { Authorization: 'Bearer secret', 'X-Custom': 'kept' },
    credentials: 'include',
});
await page.fetch(request);
check(sent[0].headers.authorization === 'Bearer secret', 'Request Authorization is kept');
check(sent[0].headers['x-custom'] === 'kept', 'Request custom header is kept');
check(sent[0].headers['x-xaman-credentials'] === 'include', 'same-origin include is stamped');

sent.length = 0;
await page.fetch(new Request('https://app.example/session', {
    headers: { Authorization: 'Bearer secret' },
    credentials: 'omit',
}));
check(sent[0].headers.authorization === 'Bearer secret', 'omit keeps Authorization');
check(sent[0].headers['x-xaman-credentials'] === 'omit', 'same-origin omit is stamped');

sent.length = 0;
await page.fetch('https://other.example/item', { credentials: 'include', headers: { Authorization: 'Bearer secret' } });
check(sent[0].headers.authorization === 'Bearer secret', 'cross-origin include keeps Authorization');
check(sent[0].headers['x-xaman-credentials'] === undefined, 'cross-origin include adds no internal header');

sent.length = 0;
await page.fetch('https://app.example/submit', { method: 'POST', credentials: 'omit', headers: { Authorization: 'Bearer secret' }, body: 'payload' });
check(sent[0].body === 'payload', 'POST body is kept');
check(sent[0].headers.authorization === 'Bearer secret', 'POST keeps Authorization');
check(sent[0].headers['x-xaman-credentials'] === undefined, 'POST omit adds no internal header');

sent.length = 0;
await page.fetch('https://other.example/submit', { method: 'PUT', credentials: 'include', body: 'payload' });
check(sent[0].headers['x-xaman-credentials'] === undefined, 'cross-origin PUT adds no internal header');

const xhr = new page.XMLHttpRequest();
xhr.open('GET', 'https://app.example/xhr');
xhr.withCredentials = true;
xhr.send();
check(sent.at(-1).headers['X-Xaman-Credentials'] === 'include', 'same-origin XHR include is stamped');

const cross = new page.XMLHttpRequest();
cross.open('POST', 'https://other.example/xhr');
cross.withCredentials = true;
cross.send('body');
check(sent.at(-1).headers['X-Xaman-Credentials'] === undefined, 'cross-origin POST XHR adds no internal header');

process.stdout.write(
    'credential stamp: Request headers, redirect-safe modes, and no cross-origin header passed\n',
);
