# Back-up card removal layout

The removal screen now uses the same card summary renderer as setup instead of displaying the back-up address as loose text. Saved card names and serials are shown when available; cards not imported locally still have a named block with the full address. No “Verified” or “New” badge is inferred from saved data.

- `before-light.png`: earlier native capture of the unchanged removal screen. Its component source is byte-identical between release 455 and this fix’s base (SHA-256 `aa3e5d972093250eb4561190972b3dbfee1c7082b2feaccda2bad3151ed84f3a`).
- `removal-light.png`: locally saved card, light theme.
- `removal-dark.png`: locally saved card, dark theme.
- `removal-not-imported-light.png`: linked card not stored on the phone.

These are native iOS simulator captures of the actual updated screen in an optimized Hermes preview host, using an in-memory Realm and synthetic card/ledger data. The existing simulator native binary is reused. No physical NFC, live transaction, connected-phone or Android visual test is claimed.

Validation: 67 focused UI, flow and native-adapter checks passed, including removal confirmation and hiding the old link after success. Full TypeScript, staged ESLint, locale and production-endpoint hooks passed. No signing/removal behavior, translations or dependencies changed.
