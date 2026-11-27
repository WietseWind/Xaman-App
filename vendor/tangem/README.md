# Tangem SDK recovery

These files are part of the application source. Keep them in Git, outside `node_modules`,
`ios/Pods`, Gradle caches and generated build folders. Do not put the binary files in Git LFS: a
normal checkout must contain the SDK even when the old vendor release cannot be downloaded.
No private keys, wallet data, credentials or application state are included.

## Versions and origin

- React Native wrapper: **2.3.1**, still installed by the existing npm lockfile.
- Android SDK: **3.7.2**, both `com.github.tangem.tangem-sdk-android:android` and `:core`.
  The AAR and JAR are **exact cached Jetifier transforms** from a previously working build.
  They are not claimed to be pristine JitPack downloads or rebuilt upstream binaries.
- iOS SDK: **3.4.0**, exact cached CocoaPods source with the existing ActivityIndicatorView
  compatibility change. The local podspec is the original CocoaPods 3.4.0 specification.

`manifest.json` records sizes and SHA-256 for every SDK, metadata and licence file.
Android `.module` and POM files were recovered from Gradle's cached published variants:
Android API/runtime dependency counts are 0/15; core counts are 1/13. Requested versions,
variant attributes and scopes are retained. The original remote POM files were unavailable.
`provenance/android-cached-variants.json` preserves the exported requested metadata.
App-wide version conflict resolution and existing dependency forces remain in effect.

### Licence evidence

The XRPL Labs wrapper 2.3.1 tag commit
[`1b2bad24e5fb2b19c94f4ebea51c283602289e32`](https://github.com/XRPL-Labs/tangem-sdk-react-native/tree/1b2bad24e5fb2b19c94f4ebea51c283602289e32)
has commit date 2023-03-30 and already pins Android 3.7.2. The cached core JAR has
2023-03-28 ZIP entry timestamps. The Tangem Android source snapshot at
[`9073665c9aa9c37cf38b5c98056a2ed59afa9b80`](https://github.com/tangem/tangem-sdk-android/tree/9073665c9aa9c37cf38b5c98056a2ed59afa9b80)
(2023-03-29) has the included MIT licence. The upstream licence changed in 2025; that
current licence is not substituted for the MIT-era 3.7.2 release. The original 3.7.2 tag
is now absent, so its original release commit and pristine artifact hashes are unknown.

iOS 3.4.0's MIT licence and original source tag are recorded by the original CocoaPods
specification. The currently available upstream tag points to
`d2ab30b513d1058d98069ae9d661120c113b78ec`; it has since redacted author/comments in
many files. This snapshot preserves the earlier cached source and notices byte for byte,
including the already applied Color-initializer fix. It does not replace it with rewritten
upstream source.

## Build and recovery

```sh
node scripts/check-tangem-sdk.js
npm ci
(cd android && ./gradlew assembleDebug)
(cd ios && pod install)
```

Android uses the committed Maven repository exclusively for these two Tangem coordinates.
The local metadata keeps all transitive dependencies; other Maven libraries still use
the application's usual repositories and caches. iOS CocoaPods uses the local source
pod directly. Neither platform downloads the Tangem native SDK. A normal clean checkout
still needs the other npm, Maven and CocoaPods dependencies. This is not a complete
air-gapped dependency mirror.

The post-install dependency check, both native build configurations and the dedicated CI
job verify the recovery manifest. Missing, edited or LFS-pointer SDK files fail early.
To recover after cleanup, restore `vendor/tangem` from the signed Git commit and run the
check again; do not fetch a different SDK version as a fallback.

For an intentional SDK upgrade, review its licence and native behavior, replace the
artifacts/source and their full metadata together, update the manifest and version pins,
and rerun the recovery tests plus both native builds. Do not regenerate hashes merely
to accept an unexplained mismatch.
