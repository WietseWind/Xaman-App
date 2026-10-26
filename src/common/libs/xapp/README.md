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
