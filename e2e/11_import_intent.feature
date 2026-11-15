Feature: Import and upgrade pick the intended account
    # A mnemonic or a family seed gives one address on secp256k1 and another on ed25519. When the
    # app already knows one of them (the account that is upgraded, or a read-only account), it
    # takes that one by itself: no curve to pick, no ledger lookup, no error.
    #
    # The accounts are made up for each scenario and never activated, so the ledger cannot tell
    # which curve is in use: without the rules every scenario here ends in an error or in the
    # wrong account.

    Background:
        Then I leave account import if open

    # Upgrade, mnemonic, account on the ed25519 curve
    Scenario: Import a read-only account that is on the ed25519 curve of a mnemonic
        Then I prepare a new mnemonic account on curve "ed25519"
        Then I tap 'tab-Settings'
        Given I should have 'settings-tab-screen'
        Then I tap 'accounts-button'
        Given I should have 'accounts-list-screen'
        Then I tap 'add-account-button'
        Given I should see 'account-add-screen'
        Then I tap 'account-import-button'
        Given I should see 'account-import-access-level-view'
        Then I tap 'readonly-radio-button'
        Then I tap 'next-button'
        Given I should see 'account-import-enter-address-view'
        Then I enter the address in the input
        Then I tap 'next-button'
        Given I should have 'account-import-label-view'
        Then I enter 'RO-MN-Ed' in 'label-input'
        Then I tap 'next-button'
        Given I should have 'account-import-finish-view'
        Then I tap 'finish-button'
        Given I should have 'home-tab-view'
        Given I should see same account address

    Scenario: Upgrade it with the mnemonic without picking a curve
        Then I tap 'tab-Settings'
        Given I should have 'settings-tab-screen'
        Then I tap 'accounts-button'
        Given I should have 'accounts-list-screen'
        Then I tap my account in the list
        Given I should have 'account-settings-screen'
        Then I tap 'account-access-level-button'
        Given I should have 'picker-modal'
        Then I tap 'Full-item'
        Then I tap alert button with label "Yes, I'm sure"
        Given I should have 'account-import-secret-type-view'
        Then I tap 'mnemonic-radio-button'
        Then I tap 'next-button'
        Given I should have 'account-import-mnemonic-alert-view'
        Then I tap 'next-button'
        Given I should have 'account-import-enter-mnemonic-view'
        Then I tap '12-words-button'
        Then I enter my mnemonic
        Then I tap 'next-button'
        Given I should have 'account-import-security-view'
        Then I tap 'next-button'
        Given I should have 'account-import-finish-view'
        Then I tap 'finish-button'
        Given I should have 'home-tab-view'
        Given I should see same account address
        Then I tap 'tab-Settings'
        Given I should have 'settings-tab-screen'
        Then I tap 'accounts-button'
        Given I should have 'accounts-list-screen'
        Then I tap my account in the list
        Given I should have 'account-settings-screen'
        Given I should see 'Full access' in 'account-access-level-value'

    # Upgrade, family seed, account on the ed25519 curve
    Scenario: Import a read-only account that is on the ed25519 curve of a family seed
        Then I prepare a new family seed account on curve "ed25519"
        Then I tap 'tab-Settings'
        Given I should have 'settings-tab-screen'
        Then I tap 'accounts-button'
        Given I should have 'accounts-list-screen'
        Then I tap 'add-account-button'
        Given I should see 'account-add-screen'
        Then I tap 'account-import-button'
        Given I should see 'account-import-access-level-view'
        Then I tap 'readonly-radio-button'
        Then I tap 'next-button'
        Given I should see 'account-import-enter-address-view'
        Then I enter the address in the input
        Then I tap 'next-button'
        Given I should have 'account-import-label-view'
        Then I enter 'RO-FS-Ed' in 'label-input'
        Then I tap 'next-button'
        Given I should have 'account-import-finish-view'
        Then I tap 'finish-button'
        Given I should have 'home-tab-view'
        Given I should see same account address

    Scenario: Upgrade it with the family seed without picking a curve
        Then I tap 'tab-Settings'
        Given I should have 'settings-tab-screen'
        Then I tap 'accounts-button'
        Given I should have 'accounts-list-screen'
        Then I tap my account in the list
        Given I should have 'account-settings-screen'
        Then I tap 'account-access-level-button'
        Given I should have 'picker-modal'
        Then I tap 'Full-item'
        Then I tap alert button with label "Yes, I'm sure"
        Given I should have 'account-import-secret-type-view'
        Then I tap 'family-seed-radio-button'
        Then I tap 'next-button'
        Given I should have 'account-import-enter-family-seed-view'
        Then I enter my seed in the input
        Given I should see family seed curve "ed25519"
        Then I tap 'next-button'
        Given I should have 'account-import-security-view'
        Then I tap 'next-button'
        Given I should have 'account-import-finish-view'
        Then I tap 'finish-button'
        Given I should have 'home-tab-view'
        Given I should see same account address
        Then I tap 'tab-Settings'
        Given I should have 'settings-tab-screen'
        Then I tap 'accounts-button'
        Given I should have 'accounts-list-screen'
        Then I tap my account in the list
        Given I should have 'account-settings-screen'
        Given I should see 'Full access' in 'account-access-level-value'

    # Upgrade of one account with the secret of another read-only account
    Scenario: Import read-only account B, for which the secret is known
        Then I prepare a new family seed account on curve "secp256k1"
        Then I keep this account as "B"
        Then I tap 'tab-Settings'
        Given I should have 'settings-tab-screen'
        Then I tap 'accounts-button'
        Given I should have 'accounts-list-screen'
        Then I tap 'add-account-button'
        Given I should see 'account-add-screen'
        Then I tap 'account-import-button'
        Given I should see 'account-import-access-level-view'
        Then I tap 'readonly-radio-button'
        Then I tap 'next-button'
        Given I should see 'account-import-enter-address-view'
        Then I enter the address in the input
        Then I tap 'next-button'
        Given I should have 'account-import-label-view'
        Then I enter 'RO-B' in 'label-input'
        Then I tap 'next-button'
        Given I should have 'account-import-finish-view'
        Then I tap 'finish-button'
        Given I should have 'home-tab-view'
        Given I should see same account address

    Scenario: Import read-only account A
        Then I prepare a new address without a secret
        Then I keep this account as "A"
        Then I tap 'tab-Settings'
        Given I should have 'settings-tab-screen'
        Then I tap 'accounts-button'
        Given I should have 'accounts-list-screen'
        Then I tap 'add-account-button'
        Given I should see 'account-add-screen'
        Then I tap 'account-import-button'
        Given I should see 'account-import-access-level-view'
        Then I tap 'readonly-radio-button'
        Then I tap 'next-button'
        Given I should see 'account-import-enter-address-view'
        Then I enter the address in the input
        Then I tap 'next-button'
        Given I should have 'account-import-label-view'
        Then I enter 'RO-A' in 'label-input'
        Then I tap 'next-button'
        Given I should have 'account-import-finish-view'
        Then I tap 'finish-button'
        Given I should have 'home-tab-view'
        Given I should see same account address

    Scenario: Upgrading A with the secret of B continues as an upgrade of B
        Then I use the account kept as "A"
        Then I tap 'tab-Settings'
        Given I should have 'settings-tab-screen'
        Then I tap 'accounts-button'
        Given I should have 'accounts-list-screen'
        Then I tap my account in the list
        Given I should have 'account-settings-screen'
        Then I tap 'account-access-level-button'
        Given I should have 'picker-modal'
        Then I tap 'Full-item'
        Then I tap alert button with label "Yes, I'm sure"
        Given I should have 'account-import-secret-type-view'
        Then I tap 'family-seed-radio-button'
        Then I tap 'next-button'
        Given I should have 'account-import-enter-family-seed-view'
        Then I use the account kept as "B"
        Then I enter my seed in the input
        Then I tap 'next-button'
        Given I should have 'account-import-show-address-view'
        Given I should see same account address
        Then I tap 'next-button'
        Given I should see 'account-import-explain-activation-view'
        Then I tap 'next-button'
        Given I should have 'account-import-security-view'
        Then I tap 'next-button'
        Given I should have 'account-import-finish-view'
        Then I tap 'finish-button'
        Given I should have 'home-tab-view'
        Given I should see same account address

    Scenario: B has full access
        Then I use the account kept as "B"
        Then I tap 'tab-Settings'
        Given I should have 'settings-tab-screen'
        Then I tap 'accounts-button'
        Given I should have 'accounts-list-screen'
        Then I tap my account in the list
        Given I should have 'account-settings-screen'
        Given I should see 'Full access' in 'account-access-level-value'

    Scenario: A is still read-only
        Then I use the account kept as "A"
        Then I tap 'tab-Settings'
        Given I should have 'settings-tab-screen'
        Then I tap 'accounts-button'
        Given I should have 'accounts-list-screen'
        Then I tap my account in the list
        Given I should have 'account-settings-screen'
        Given I should see 'Read only' in 'account-access-level-value'

    # Add account -> Import, the read-only account is on the other curve
    Scenario: Import a read-only account that is on the ed25519 curve of another family seed
        Then I prepare a new family seed account on curve "ed25519"
        Then I tap 'tab-Settings'
        Given I should have 'settings-tab-screen'
        Then I tap 'accounts-button'
        Given I should have 'accounts-list-screen'
        Then I tap 'add-account-button'
        Given I should see 'account-add-screen'
        Then I tap 'account-import-button'
        Given I should see 'account-import-access-level-view'
        Then I tap 'readonly-radio-button'
        Then I tap 'next-button'
        Given I should see 'account-import-enter-address-view'
        Then I enter the address in the input
        Then I tap 'next-button'
        Given I should have 'account-import-label-view'
        Then I enter 'RO-FS-Ed-Add' in 'label-input'
        Then I tap 'next-button'
        Given I should have 'account-import-finish-view'
        Then I tap 'finish-button'
        Given I should have 'home-tab-view'
        Given I should see same account address

    Scenario: Add account with that family seed upgrades the read-only account
        Then I open the family seed import screen
        Then I enter my seed in the input
        Given I should see family seed curve "ed25519"
        Then I tap 'next-button'
        Given I should have 'account-import-show-address-view'
        Given I should see same account address
        Then I tap 'next-button'
        Given I should see 'account-import-explain-activation-view'
        Then I tap 'next-button'
        Given I should have 'account-import-security-view'
        Then I tap 'next-button'
        Given I should have 'account-import-finish-view'
        Then I tap 'finish-button'
        Given I should have 'home-tab-view'
        Given I should see same account address
        Then I tap 'tab-Settings'
        Given I should have 'settings-tab-screen'
        Then I tap 'accounts-button'
        Given I should have 'accounts-list-screen'
        Then I tap my account in the list
        Given I should have 'account-settings-screen'
        Given I should see 'Full access' in 'account-access-level-value'

    # Back from the address confirmation, then another secret
    Scenario: Import a read-only account to go back from
        Then I prepare a new family seed account on curve "secp256k1"
        Then I tap 'tab-Settings'
        Given I should have 'settings-tab-screen'
        Then I tap 'accounts-button'
        Given I should have 'accounts-list-screen'
        Then I tap 'add-account-button'
        Given I should see 'account-add-screen'
        Then I tap 'account-import-button'
        Given I should see 'account-import-access-level-view'
        Then I tap 'readonly-radio-button'
        Then I tap 'next-button'
        Given I should see 'account-import-enter-address-view'
        Then I enter the address in the input
        Then I tap 'next-button'
        Given I should have 'account-import-label-view'
        Then I enter 'RO-Back' in 'label-input'
        Then I tap 'next-button'
        Given I should have 'account-import-finish-view'
        Then I tap 'finish-button'
        Given I should have 'home-tab-view'
        Given I should see same account address

    Scenario: Another secret after going back is imported as a new account
        Then I open the family seed import screen
        Then I enter my seed in the input
        Then I tap 'next-button'
        Given I should have 'account-import-show-address-view'
        Given I should see same account address
        Then I go back from the address confirmation
        Given I should have 'account-import-enter-family-seed-view'
        Then I generate new family seed
        Then I remember family seed address for curve "secp256k1"
        Then I enter my seed in the input
        Then I tap 'next-button'
        Then I should confirm expected family seed address
        Then I leave account import if open

    Scenario: Leave a spendable account selected
        Then I tap 'tab-Home'
        Given I should have 'home-tab-view'
        Then I select a spendable account if Send is hidden
