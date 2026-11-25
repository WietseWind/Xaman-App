# Delegation permission review — issue #383

These iOS simulator images show the production `DelegationDetails` component mounted in an isolated preview with example accounts and fixed permission data. The preview header and test controls are outside the shipping component. These are component review images, not captures of a submitted ledger transaction or the full signing flow.

| Image | State |
|---|---|
| [Grant accounts](grant-accounts-light.png) | Both resolved accounts and the permission replacement notice. |
| [Grant permissions](grant-permissions-light.png) | NFTokenModify and Payment action descriptions, icons and risk notices. |
| [Ledger object](object-light.png) | Existing delegation permissions without the grant replacement notice. |
| [Revoke](revoke-light.png) | Exact account pair and the explanation that other delegations are unchanged. |
| [Unknown permission](unknown-light.png) | Future permission with an explicit cannot-explain / do-not-proceed warning. |
| [Granular permissions](granular-light.png) | PaymentMint and PaymentBurn, including the fixCleanup3_4_0 warning. |
| [Dark theme](granular-dark.png) | Granular permission cards in the dark theme. |
| [Dutch](granular-dark-nl.png) | The same cards with Dutch text. |

## Full app review

- Review a DelegateSet with ten permissions. Check both account names and addresses, every permission, the replacement notice, and the accept flow.
- Review a Batch with two DelegateSet inner transactions for different delegates. Check that each delegate and permission list stays with its own transaction.
- Open the validated transaction and the corresponding Delegate object. Check that the shared explanations match the signing review.
- In Events, check the new Authorisations tab for incoming and outgoing Delegate objects. Check search, pull-to-refresh and the empty state. Other tabs must not contain these objects.
- Revoke from the granting account. Review must show that principal, the same receiving account, and an empty Permissions array. Receiving and watch-only accounts must not offer this action. Switching networks while an object is open must block its old revoke action.
- Review a permission from future server definitions and a permission whose description is missing in the selected language. Both must show the explicit warning.
- Check XRP and XAH text on the matching network. Explanations use the pinned definitions and native asset. Unit tests also check network-specific permission numbers and unchanged encoded transaction bytes.
- Review the new security translations with native speakers. Non-English additions use machine translation; Dutch wording received a manual pass.

Protocol references: [Delegate objects](https://xrpl.org/docs/references/protocol/ledger-data/ledger-entry-types/delegate), [permission values](https://xrpl.org/docs/references/protocol/data-types/permission-values).
