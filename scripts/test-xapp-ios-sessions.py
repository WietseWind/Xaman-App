#!/usr/bin/env python3
"""Exercise the committed iOS transport in real WebKit with synthetic sessions.

Requires macOS, Xcode and an installed iOS simulator runtime. No wallet data or
real OTT is used. Creates and deletes its own simulator unless --device is given.
Compiles the native files from the committed patch, not possibly stale installed
node_modules. --policy-only runs the Foundation policy checks without a simulator.
"""
import argparse
import http.server
import json
import plistlib
from pathlib import Path
import shutil
import ssl
import subprocess
import tempfile
import threading
import urllib.parse

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / 'scripts/fixtures/xapp-ios-sessions'
BUNDLE_ID = 'com.xrpllabs.xaman.sessionprobe'

READ_SCRIPT = """
async function readDB() {
  return await new Promise((resolve, reject) => {
    const r = indexedDB.open('sessionProbe', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('state');
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const db = r.result;
      const q = db.transaction('state').objectStore('state').get('marker');
      q.onsuccess = () => { resolve(q.result || null); db.close(); };
      q.onerror = () => reject(q.error);
    };
  });
}
async function report(phase, cookie) {
  if (phase === 'next') {
    const omit = await fetch('/credentials-omit', {credentials: 'omit'}).then(r => r.json());
    const include = await fetch('/credentials-same', {credentials: 'same-origin'}).then(r => r.json());
    const redirected = await fetch('/resource-redirect', {credentials: 'include',
      headers: {Authorization: 'synthetic-private'}}).then(r => r.json());
    const posted = await fetch('/fetch-post-307', {method: 'POST', body: 'value=synthetic'}).then(r => r.json());
    window.webkit.messageHandlers.probe.postMessage({phase: 'fetch-policy', omit, include, redirected, posted});
  }
  window.webkit.messageHandlers.probe.postMessage({phase, serverCookie: cookie,
    clientCookie: document.cookie, local: localStorage.getItem('marker'),
    session: sessionStorage.getItem('marker'), indexedDB: await readDB(), history: history.length});
}
"""


def run(args, **kwargs):
    return subprocess.run(args, check=True, text=True, **kwargs)


def extract_native(folder):
    patch = (ROOT / 'patches/react-native-webview+13.17.0.patch').read_text()
    for name in ['XamanOttSchemeHandler.h', 'XamanOttSchemeHandler.m']:
        marker = '+++ b/node_modules/react-native-webview/apple/' + name + '\n'
        section = patch.split(marker, 1)[1].split('\ndiff --git ', 1)[0]
        source = ''.join(line[1:] + '\n' for line in section.splitlines()
                         if line.startswith('+') and not line.startswith('+++'))
        (folder / name).write_text(source)


class Server(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', self.server.base)
        self.send_header('Access-Control-Allow-Credentials', 'true')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        self.end_headers()

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path).path
        cookie = self.headers.get('Cookie', '')
        body = self.rfile.read(int(self.headers.get('Content-Length', '0'))).decode()
        self.server.records.append({'path': path, 'cookie': cookie, 'method': self.command, 'body': body,
                                    'auth': self.headers.get('Authorization'),
                                    'ott': '(ott:' in self.headers.get('User-Agent', '')})
        attributes = '; Path=/; HttpOnly;' + (' SameSite=None; Secure' if self.server.secure else ' SameSite=Lax')
        redirects = {'/redirect': ('/after-redirect', 'PHPSESSID=rotated' + attributes),
                     '/logout': ('/after-logout', 'PHPSESSID=; Max-Age=0; Path=/')}
        if path in redirects or path in ['/cross-redirect', '/resource-redirect', '/loop',
                                         '/post-redirect-307', '/post-redirect-303', '/fetch-post-307']:
            self.send_response(307 if path in ['/post-redirect-307', '/fetch-post-307'] else
                               303 if path == '/post-redirect-303' else 302)
            self.send_header('Access-Control-Allow-Origin', self.server.base)
            self.send_header('Access-Control-Allow-Credentials', 'true')
            if path in ['/cross-redirect', '/resource-redirect']:
                target = '/cross-target' if path == '/cross-redirect' else '/resource-target'
                self.send_header('Location', f'{self.server.scheme}://localhost:{self.server.server_port}{target}')
            elif path in redirects:
                location, header = redirects[path]
                self.send_header('Location', location)
                self.send_header('Set-Cookie', header)
            else:
                self.send_header('Location', '/fetch-post-final' if path == '/fetch-post-307' else
                                 path.replace('redirect', 'final'))
            self.end_headers()
            return
        self.send_response(200)
        self.send_header('Cache-Control', 'no-store')
        if path.startswith('/credentials-') or path in ['/resource-target', '/fetch-post-final']:
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', self.server.base)
            self.send_header('Access-Control-Allow-Credentials', 'true')
            if path == '/credentials-omit':
                self.send_header('Set-Cookie', 'must-not-store=bad; Path=/')
            self.end_headers()
            self.wfile.write(json.dumps({'cookie': cookie, 'body': body, 'method': self.command}).encode())
            return
        self.send_header('Content-Type', 'text/html')
        if path == '/start':
            self.send_header('Set-Cookie', 'PHPSESSID=server' + attributes)
        self.end_headers()
        if path == '/start':
            script = """
document.cookie = 'client=javascript; Path=/';
localStorage.setItem('marker', 'local-alive');
sessionStorage.setItem('marker', 'session-alive');
const r = indexedDB.open('sessionProbe', 1);
r.onupgradeneeded = () => r.result.createObjectStore('state');
r.onsuccess = () => {
  const db = r.result;
  const tx = db.transaction('state', 'readwrite');
  tx.objectStore('state').put('db-alive', 'marker');
  tx.oncomplete = () => { db.close(); location.href = '/next'; };
};
"""
        else:
            script = READ_SCRIPT + f';report({json.dumps(path[1:])}, {json.dumps(cookie)}).catch(e => '
            script += 'window.webkit.messageHandlers.probe.postMessage({phase:"script-error", error:String(e)}));'
        self.wfile.write(('<!doctype html><html><body><script>' + script + '</script></body></html>').encode())

    do_POST = do_GET


def cookie_set(value):
    return set(value.split('; ')) if value else set()


def validate(report, requests):
    assert report['error'] is None, (report, requests)
    rows = {row['phase']: row for row in report['records']}
    initial = {'PHPSESSID=server', 'client=javascript'}
    rotated = {'PHPSESSID=rotated', 'client=javascript'}
    for phase, expected in [('next', initial), ('after-redirect', rotated),
                            ('after-delete', {'PHPSESSID=rotated'}),
                            ('post-final-307', {'PHPSESSID=rotated'}),
                            ('post-final-303', {'PHPSESSID=rotated'}),
                            ('still-alive', {'PHPSESSID=rotated'}), ('after-logout', set())]:
        row = rows[phase]
        assert cookie_set(row['serverCookie']) == expected, (phase, row)
        assert row['local'] == 'local-alive' and row['session'] == 'session-alive', (phase, row)
        assert row['indexedDB'] == 'db-alive', (phase, row)
        assert 'PHPSESSID' not in row['clientCookie'], 'HttpOnly cookie visible to JavaScript'
    assert rows['fetch-policy']['omit']['cookie'] == '', rows['fetch-policy']
    assert cookie_set(rows['fetch-policy']['include']['cookie']) == initial, rows['fetch-policy']
    assert rows['fetch-policy']['posted']['body'] == 'value=synthetic', rows['fetch-policy']
    assert rows['fetch-policy']['posted']['method'] == 'POST', rows['fetch-policy']
    for phase in ['isolated', 'fresh', 'cross-target']:
        row = rows[phase]
        assert row['serverCookie'] == '' and row['clientCookie'] == '', (phase, row)
        assert row['local'] is None and row['session'] is None and row['indexedDB'] is None, (phase, row)
    cross = next(row for row in requests if row['path'] == '/cross-target')
    assert cross['auth'] is None and cross['cookie'] == '', cross
    resource = next(row for row in requests if row['path'] == '/resource-target')
    assert resource['auth'] is None and not resource['ott'] and resource['cookie'] == '', resource
    post = next(row for row in requests if row['path'] == '/post-final-307')
    assert post['method'] == 'POST' and post['body'] == 'value=synthetic', post
    get = next(row for row in requests if row['path'] == '/post-final-303')
    assert get['method'] == 'GET' and get['body'] == '', get
    if report['proxy']:
        assert 'loop-limit' in rows and sum(row['path'] == '/loop' for row in requests) == 9, requests


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--policy-only', action='store_true')
    parser.add_argument('--transport', choices=['plain', 'proxy', 'all'], default='all')
    parser.add_argument('--https', action='store_true', help='Use Secure/SameSite=None cookies and a test CA on an owned simulator')
    parser.add_argument('--device', help='Use an existing booted disposable simulator; leave it intact')
    parser.add_argument('--runtime', help='Simulator runtime identifier; defaults to newest available iOS')
    args = parser.parse_args()
    if args.https and args.device:
        parser.error('--https creates its own simulator so no test CA remains on an existing device')
    with tempfile.TemporaryDirectory(prefix='xaman-ios-session-') as directory:
        folder = Path(directory)
        extract_native(folder)
        shutil.copy(FIXTURES / 'CookieRegression.m', folder)
        run(['xcrun', 'clang', '-Wno-nullability-completeness', '-fobjc-arc', '-fblocks',
             '-framework', 'Foundation', '-framework', 'WebKit', str(folder / 'CookieRegression.m'),
             '-o', str(folder / 'cookie-regression')])
        run([str(folder / 'cookie-regression')])
        if args.policy_only:
            return
        sdk = run(['xcrun', '--sdk', 'iphonesimulator', '--show-sdk-path'], capture_output=True).stdout.strip()
        arch = run(['uname', '-m'], capture_output=True).stdout.strip()
        app = folder / 'SessionProbe.app'
        app.mkdir()
        run(['xcrun', 'clang', '-Wno-nullability-completeness', '-fobjc-arc', '-fblocks',
             '-target', f'{arch}-apple-ios15.0-simulator', '-Werror=unguarded-availability', '-isysroot', sdk,
             '-framework', 'Foundation', '-framework', 'UIKit', '-framework', 'WebKit',
             '-I', str(folder), str(folder / 'XamanOttSchemeHandler.m'), str(FIXTURES / 'SessionProbe.m'),
             '-o', str(app / 'SessionProbe')])
        with (app / 'Info.plist').open('wb') as file:
            # Loopback HTTP is confined to this test app. Production ATS is unchanged.
            plistlib.dump({'CFBundleIdentifier': BUNDLE_ID, 'CFBundleName': 'SessionProbe',
                          'CFBundleExecutable': 'SessionProbe', 'CFBundleVersion': '1',
                          'CFBundleShortVersionString': '1', 'CFBundlePackageType': 'APPL',
                          'LSRequiresIPhoneOS': True, 'UILaunchScreen': {},
                          'NSAppTransportSecurity': {'NSAllowsArbitraryLoads': True}}, file)
        device = args.device
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Server)
        server.records = []
        server.secure = args.https
        server.scheme = 'https' if args.https else 'http'
        server.base = f'{server.scheme}://127.0.0.1:{server.server_port}'
        if args.https:
            certificate, key = folder / 'test-ca.pem', folder / 'test-key.pem'
            run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                 '-subj', '/CN=Xaman Session Regression', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost',
                 '-addext', 'basicConstraints=critical,CA:TRUE', '-keyout', str(key), '-out', str(certificate)],
                capture_output=True)
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(certificate, key)
            server.socket = context.wrap_socket(server.socket, server_side=True)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            if not device:
                runtimes = json.loads(run(['xcrun', 'simctl', 'list', 'runtimes', '-j'], capture_output=True).stdout)
                available = [r for r in runtimes['runtimes'] if r['isAvailable'] and '.iOS-' in r['identifier']]
                runtime = args.runtime or max(available, key=lambda r: tuple(map(int, r['version'].split('.'))))['identifier']
                device = run(['xcrun', 'simctl', 'create', 'Xaman Session Regression',
                              'com.apple.CoreSimulator.SimDeviceType.iPhone-15', runtime], capture_output=True).stdout.strip()
                run(['xcrun', 'simctl', 'boot', device])
                run(['xcrun', 'simctl', 'bootstatus', device, '-b'], capture_output=True)
            if args.https:
                # Only the simulator created above trusts this disposable CA.
                run(['xcrun', 'simctl', 'keychain', device, 'add-root-cert', str(certificate)])
            run(['xcrun', 'simctl', 'install', device, str(app)])
            histories = {}
            for transport in (['plain', 'proxy'] if args.transport == 'all' else [args.transport]):
                server.records.clear()
                result = run(['xcrun', 'simctl', 'launch', '--console', device, BUNDLE_ID,
                              server.base, transport], capture_output=True, timeout=75)
                lines = [line for line in result.stdout.splitlines() if line.startswith('PROBE_RESULT ')]
                assert lines, (result.stdout + result.stderr)[-6000:]
                report = json.loads(lines[-1].removeprefix('PROBE_RESULT '))
                validate(report, server.records)
                histories[transport] = {row['phase']: row['history'] for row in report['records'] if 'history' in row}
                print(f'iOS WebKit {transport}: session, redirects, deletion, fetch credentials, '
                      'HttpOnly, cross-origin isolation, storage continuity and two-view/close isolation passed', flush=True)
            if len(histories) == 2:
                assert histories['plain'] == histories['proxy'], histories
                print('Top-level redirect history matches plain WebKit; 307 POST and 303 GET semantics passed', flush=True)
        finally:
            server.shutdown()
            if device:
                subprocess.run(['xcrun', 'simctl', 'terminate', device, BUNDLE_ID], capture_output=True)
                subprocess.run(['xcrun', 'simctl', 'uninstall', device, BUNDLE_ID], capture_output=True)
                if not args.device:
                    subprocess.run(['xcrun', 'simctl', 'shutdown', device], capture_output=True)
                    subprocess.run(['xcrun', 'simctl', 'delete', device], capture_output=True)


if __name__ == '__main__':
    main()
