# Updates

Per-version log of what landed in each update cycle: issue → PR → branch, newest version first.
Maintained as changes are merged into the `update/x.y.z` branch; the update branch merges to `main` at the end of the cycle.

## 5.2.6 — `update/5.2.6` (in progress)

| Issue | PR | Branch | Change |
|---|---|---|---|
| [#96](https://github.com/WietseWind/Xaman-App/issues/96) | [#99](https://github.com/WietseWind/Xaman-App/pull/99) | `fix/tx-template-qr-network` | Transaction template QR/deeplink no longer errors "not on this network" on XRPL networks; explicit Xahau `NetworkID` (21337/21338) now offers network switch via review flow |
