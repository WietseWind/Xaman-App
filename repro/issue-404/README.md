# Native Tangem back-up flow proof

These screenshots show the implemented screens in an optimized iOS native host with current JavaScript and freshly compiled card artwork. Cards, addresses, balances and ledger replies are synthetic test fixtures; no physical NFC scan or funded transaction is claimed. The signing adapter still encodes and verifies the fixture signature with the real codec.

The native run covers source-card mismatch, rejection of the same back-up card, empty-card creation/import, reuse of an existing card, visible fee review, automatic validated confirmation, disappearance of the Home warning, all three Settings states, light/dark themes, both warning variants and German text. Only the original fixture card signs.

The wizard supports the selected XRPL or Xahau network; its Home warning remains XRPL Mainnet-only. All new card sessions use offline attestation. No master-key disabling transaction is created.

Full Jest: 2,548 tests and 60 snapshots passed, with 7 existing skipped tests. TypeScript, ESLint, endpoint checks and locale JSON/interpolation checks passed. All 59 locale bundles include the new copy; every pre-existing translation, including the entire `moment` properties, is unchanged. See [validation.json](validation.json) for the safe summary. Real-card setup/replacement and live XRPL/Xahau ledger behavior remain manual hardware checks.

- [home light](home-light.png)
- [intro light](intro-light.png)
- [review light](review-light.png)
- [done light](done-light.png)
- [settings none](settings-none.png)
- [settings linked](settings-linked.png)
- [settings unknown](settings-unknown.png)
- [intro dark](intro-dark.png)
- [review dark](review-dark.png)
- [secrets light](secrets-light.png)
- [secrets dark](secrets-dark.png)
- [wrong source](wrong-source.png)
- [same card](same-card.png)
- [new card ready](new-card-ready.png)
- [intro de](intro-de.png)
