# xApp OTT scope

The checked-in Public Suffix List snapshot covers ICANN domains, private hosting
suffixes, wildcard rules and exceptions. Both browser ASCII and native Unicode
spellings are retained. The TypeScript policy and the native WebView patch use
identical rule data (see publicSuffixRules.NOTICE for the MPL-2.0 notice).

Android keeps Chromium's default User-Agent free of OTT. Its scoped transport
adds OTT to permitted HTTPS GET/HEAD/OPTIONS requests and owned-host X-OTT
bootstrap headers, and checks every resource redirect. Main-document redirects
restart navigation so the destination gets its own origin. Requests with bodies,
WebSockets, iframe documents and proxy fallbacks use Chromium's token-free UA.
Origin-scoped document-start scripts preserve the SDK's navigator.userAgent
interface; older WebViews use the page-start fallback. Device smoke tests should
cover server-side bootstrap, frontend SDK authentication, redirects and POSTs.

To update the snapshot after installing dependencies and applying patches:

```sh
python3 scripts/sync-xapp-public-suffixes.py --download
npx patch-package react-native-webview
python3 scripts/test-xapp-ott-native.py
```

The native probe compiles the actual Java scope/transport with Android API
doubles and a loopback server. On macOS it also compiles and runs the actual
Objective-C scope. It checks native snapshot parity with the JSON source; it is
not an APK or device test.

iOS xApp sessions use a private, non-persistent website data store per WebView.
Cookies, localStorage, sessionStorage and IndexedDB survive page navigation in
that view; reopening creates an empty store. The HTTP proxy reads the view's
current cookie snapshot for each request, including JavaScript deletions, and
awaits response cookie writes before delivering the response or redirect.
It does not use the app-wide cookie store. Service workers remain disabled.

On macOS with Xcode and an installed iOS simulator runtime:

```sh
python3 scripts/test-xapp-ios-sessions.py
python3 scripts/test-xapp-ios-sessions.py --https
```

This compiles the actual handler from the committed patch and runs a synthetic
HTTP session server with both the proxy and plain WebKit as a control. It checks
navigation, redirects, session rotation/deletion, fetch credential omission,
HttpOnly, cross-origin isolation, storage continuity, simultaneous views and
close/reopen isolation. The temporary app's loopback HTTP exception does not
alter production transport policy. No wallet data or real OTT is used. The
script creates and deletes its own simulator; `--device UUID` instead uses an
existing booted disposable simulator. `--policy-only` runs the Foundation cookie
scope, prefix, expiry and SameSite policy checks without a simulator.
`--https` also exercises Secure/HttpOnly/SameSite=None session cookies using a
disposable CA trusted only by the simulator it creates and deletes. Normal TLS
validation is retained. Redirect coverage includes POST bodies on 307, GET
conversion on 303, history parity with WebKit and the redirect-loop limit.
