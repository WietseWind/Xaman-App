# Tangem backup scan, layout and alert refinements

The wrong-card alert names the selected card instead of displaying serial diagnostics. Import explains that the card was previously used, followed by the ownership/trust paragraph. Scan actions use the existing NFC icon and explicit original/back-up labels. All 59 locale bundles contain the updated messages and name variable; moment and unrelated translations are unchanged.

Replace is 28 points high at default text size and sits beside the Back-up card heading, leaving the name and address the full width below. Wizard card corners are 10 points, section headings are centered, and progress uses three separate segments.

The retired backup xApp/QR entry uses the existing formatted information alert. It renders without account refresh; the native fixture deliberately leaves that refresh unresolved. Navigation/account/network/lock guards and the live setup preflight remain.

Full Jest: 2,562 tests and 60 snapshots passed, with 7 existing skipped tests. 360 focused checks plus TypeScript, ESLint, locale/interpolation/JSON and endpoint checks passed.

These are actual native screens in an optimized iOS host with synthetic public cards and ledger replies. No physical NFC, funded transaction or physical camera/QR latency measurement is claimed. See [validation.json](validation.json).

- [scan-original-light](scan-original-light.png)
- [wrong-card-name-light](wrong-card-name-light.png)
- [scan-backup-light](scan-backup-light.png)
- [existing-card-import-light](existing-card-import-light.png)
- [ready-centered-light](ready-centered-light.png)
- [review-segments-light](review-segments-light.png)
- [replace-heading-light](replace-heading-light.png)
- [wrong-card-name-dark](wrong-card-name-dark.png)
- [ready-centered-dark](ready-centered-dark.png)
- [replace-heading-dark](replace-heading-dark.png)
- [retired-qr-info-light](retired-qr-info-light.png)
