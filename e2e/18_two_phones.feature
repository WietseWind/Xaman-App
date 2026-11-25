Feature: Two phones sign for one transaction: multi sign, and a Batch
    # Each phone has its own run of this suite; the runs share a state file (see e2e/step_definitions/
    # twoPhones.js and scripts/e2e/two-phones.sh). In a run for one phone, and in the normal suite, the
    # scenarios of the other phone (or all of them) are skipped.
    #
    # Accounts, made by the first phone:
    #   Xahau Testnet   D   signer list S1 + S2, quorum 2
    #   XRPL Testnet    BA  signer list S1 + S2, quorum 2 (a Batch Account that is multi signed)
    #                   X1  an inner account             P2  a Batch Account
    #   first phone: S1 and X1 in the app        second phone: S2 and P2 in the app
    #
    # What is proven with real sign requests, each signed on a phone, and the ledger:
    #   1. generic multi sign: S1 signs on the first phone, S2 on the second; one signature alone is below the
    #      quorum, both together are accepted (Xahau Testnet)
    #   2. a Batch with an inner account of someone else: X1 signs its BatchSigner on the first phone, the
    #      Batch Account P2 signs and submits on the second (XRPL Testnet)
    #   3. a multi signed Batch (issue 533): X1 signs its BatchSigner, then S1 (first phone) and S2 (second
    #      phone) multi sign the Batch; both together are accepted (XRPL Testnet)

    Background:
        Given sign requests can be created through the Xaman API
        Then I leave account import if open

    # ---------------------------------------------------------------- the first phone
    Scenario: First phone: prepare the accounts on both testnets
        Given this is the "first" phone of a two phone run
        Then I prepare the accounts of the two phone run

    Scenario: First phone: import the signer S1
        Given this is the "first" phone of a two phone run
        Then I use the two phone account "S1"
        Then I tap 'tab-Settings'
        Given I should have 'settings-tab-screen'
        Then I tap 'accounts-button'
        Given I should have 'accounts-list-screen'
        Then I tap 'add-account-button'
        Given I should see 'account-add-screen'
        Then I tap 'account-import-button'
        Given I should see 'account-import-access-level-view'
        Then I tap 'next-button'
        Given I should have 'account-import-secret-type-view'
        Then I tap 'family-seed-radio-button'
        Then I tap 'next-button'
        Then I enter my seed in the input
        Then I tap 'next-button'
        Given I should have 'account-import-show-address-view'
        Given I should see same account address
        Then I tap 'next-button'
        Given I should see 'account-import-explain-activation-view'
        Then I tap 'next-button'
        Given I should have 'account-import-security-view'
        Then I tap 'next-button'
        Given I should have 'account-import-label-view'
        Then I enter 'TP-S1' in 'label-input'
        Then I tap 'next-button'
        Given I should have 'account-import-finish-view'
        Then I tap 'finish-button'
        Then I tap 'tab-Home'
        Given I should have 'home-tab-view'
        Given I should see same account address

    Scenario: First phone: import the inner account X1
        Given this is the "first" phone of a two phone run
        Then I use the two phone account "X1"
        Then I tap 'tab-Settings'
        Given I should have 'settings-tab-screen'
        Then I tap 'accounts-button'
        Given I should have 'accounts-list-screen'
        Then I tap 'add-account-button'
        Given I should see 'account-add-screen'
        Then I tap 'account-import-button'
        Given I should see 'account-import-access-level-view'
        Then I tap 'next-button'
        Given I should have 'account-import-secret-type-view'
        Then I tap 'family-seed-radio-button'
        Then I tap 'next-button'
        Then I enter my seed in the input
        Then I tap 'next-button'
        Given I should have 'account-import-show-address-view'
        Given I should see same account address
        Then I tap 'next-button'
        Given I should see 'account-import-explain-activation-view'
        Then I tap 'next-button'
        Given I should have 'account-import-security-view'
        Then I tap 'next-button'
        Given I should have 'account-import-label-view'
        Then I enter 'TP-X1' in 'label-input'
        Then I tap 'next-button'
        Given I should have 'account-import-finish-view'
        Then I tap 'finish-button'
        Then I tap 'tab-Home'
        Given I should have 'home-tab-view'
        Given I should see same account address

    Scenario: First phone: S1 signs the multi sign request
        Given this is the "first" phone of a two phone run
        Then I create the multi sign request of the two phone run for signer "S1"
        Then I open the two phone sign request
        Given I should have 'review-transaction-modal'
        Then I scroll the review to the slide button
        Then I slide right 'accept-button'
        Then I type my passcode
        Given I should wait 60 sec to see 'signed-result-view'
        Then I tap 'close-button'
        Given I keep the multi signed result of signer "S1"

    Scenario: First phone: switch to XRPL Testnet
        Given this is the "first" phone of a two phone run
        Then I tap 'network-switch-button'
        Given I should have 'switch-network-overlay'
        Then I tap 'network-TESTNET'
        Given I should have 'home-tab-view'

    Scenario: First phone: X1 signs its BatchSigner for the Batch of P2
        Given this is the "first" phone of a two phone run
        Then I create the sign request for the Batch of "P2" with inner accounts "P2,X1" for the inner account
        Then I open the two phone sign request
        Given I should have 'review-transaction-modal'
        Then I scroll the review to the slide button
        Then I slide right 'accept-button'
        Then I type my passcode
        Given I should wait 60 sec to see 'signed-result-view'
        Then I tap 'close-button'
        Given I keep the BatchSigner of "X1" for the Batch of "P2"

    Scenario: First phone: X1 signs its BatchSigner for the Batch of BA
        Given this is the "first" phone of a two phone run
        Then I create the sign request for the Batch of "BA" with inner accounts "BA,X1" for the inner account
        Then I open the two phone sign request
        Given I should have 'review-transaction-modal'
        Then I scroll the review to the slide button
        Then I slide right 'accept-button'
        Then I type my passcode
        Given I should wait 60 sec to see 'signed-result-view'
        Then I tap 'close-button'
        Given I keep the BatchSigner of "X1" for the Batch of "BA"

    Scenario: First phone: S1 multi signs the Batch of BA
        Given this is the "first" phone of a two phone run
        Then I create the multi sign request for the Batch of "BA" for signer "S1"
        Then I open the two phone sign request
        Given I should have 'review-transaction-modal'
        Then I scroll the review to the slide button
        Then I slide right 'accept-button'
        Then I type my passcode
        Given I should wait 60 sec to see 'signed-result-view'
        Then I tap 'close-button'
        Given I keep the multi signed Batch of "BA" of signer "S1"

    Scenario: First phone: switch back to Xahau Testnet
        Given this is the "first" phone of a two phone run
        Then I tap 'network-switch-button'
        Given I should have 'switch-network-overlay'
        Then I tap 'network-XAHAUTESTNET'
        Given I should have 'home-tab-view'

    # ---------------------------------------------------------------- the second phone
    Scenario: Second phone: import the signer S2
        Given this is the "second" phone of a two phone run
        Then I use the two phone account "S2"
        Then I tap 'tab-Settings'
        Given I should have 'settings-tab-screen'
        Then I tap 'accounts-button'
        Given I should have 'accounts-list-screen'
        Then I tap 'add-account-button'
        Given I should see 'account-add-screen'
        Then I tap 'account-import-button'
        Given I should see 'account-import-access-level-view'
        Then I tap 'next-button'
        Given I should have 'account-import-secret-type-view'
        Then I tap 'family-seed-radio-button'
        Then I tap 'next-button'
        Then I enter my seed in the input
        Then I tap 'next-button'
        Given I should have 'account-import-show-address-view'
        Given I should see same account address
        Then I tap 'next-button'
        Given I should see 'account-import-explain-activation-view'
        Then I tap 'next-button'
        Given I should have 'account-import-security-view'
        Then I tap 'next-button'
        Given I should have 'account-import-label-view'
        Then I enter 'TP-S2' in 'label-input'
        Then I tap 'next-button'
        Given I should have 'account-import-finish-view'
        Then I tap 'finish-button'
        Then I tap 'tab-Home'
        Given I should have 'home-tab-view'
        Given I should see same account address

    Scenario: Second phone: import the Batch Account P2
        Given this is the "second" phone of a two phone run
        Then I use the two phone account "P2"
        Then I tap 'tab-Settings'
        Given I should have 'settings-tab-screen'
        Then I tap 'accounts-button'
        Given I should have 'accounts-list-screen'
        Then I tap 'add-account-button'
        Given I should see 'account-add-screen'
        Then I tap 'account-import-button'
        Given I should see 'account-import-access-level-view'
        Then I tap 'next-button'
        Given I should have 'account-import-secret-type-view'
        Then I tap 'family-seed-radio-button'
        Then I tap 'next-button'
        Then I enter my seed in the input
        Then I tap 'next-button'
        Given I should have 'account-import-show-address-view'
        Given I should see same account address
        Then I tap 'next-button'
        Given I should see 'account-import-explain-activation-view'
        Then I tap 'next-button'
        Given I should have 'account-import-security-view'
        Then I tap 'next-button'
        Given I should have 'account-import-label-view'
        Then I enter 'TP-P2' in 'label-input'
        Then I tap 'next-button'
        Given I should have 'account-import-finish-view'
        Then I tap 'finish-button'
        Then I tap 'tab-Home'
        Given I should have 'home-tab-view'
        Given I should see same account address

    Scenario: Second phone: S2 signs the same multi sign request, and the ledger accepts both signatures
        Given this is the "second" phone of a two phone run
        Then I create the multi sign request of the two phone run for signer "S2"
        Then I open the two phone sign request
        Given I should have 'review-transaction-modal'
        Then I scroll the review to the slide button
        Then I slide right 'accept-button'
        Then I type my passcode
        Given I should wait 60 sec to see 'signed-result-view'
        Then I tap 'close-button'
        Given I keep the multi signed result of signer "S2"
        Given the ledger should refuse one multi signature alone and accept both phones combined

    Scenario: Second phone: switch to XRPL Testnet
        Given this is the "second" phone of a two phone run
        Then I tap 'network-switch-button'
        Given I should have 'switch-network-overlay'
        Then I tap 'network-TESTNET'
        Given I should have 'home-tab-view'

    Scenario: Second phone: P2 signs its Batch with the BatchSigner of the first phone, and the app submits it
        Given this is the "second" phone of a two phone run
        Then I create the sign request for the Batch of "P2" with the BatchSigners of the other phone
        Then I open the two phone sign request
        Given I should have 'review-transaction-modal'
        Then I scroll the review to the slide button
        Then I slide right 'accept-button'
        Then I type my passcode
        Given I should wait 60 sec to see 'success-result-view'
        Then I tap 'close-button'
        Given the ledger should have the Batch of "P2" that this phone signed and submitted

    Scenario: Second phone: S2 multi signs the Batch of BA, and the ledger accepts both signatures
        Given this is the "second" phone of a two phone run
        Then I create the multi sign request for the Batch of "BA" for signer "S2"
        Then I open the two phone sign request
        Given I should have 'review-transaction-modal'
        Then I scroll the review to the slide button
        Then I slide right 'accept-button'
        Then I type my passcode
        Given I should wait 60 sec to see 'signed-result-view'
        Then I tap 'close-button'
        Given I keep the multi signed Batch of "BA" of signer "S2"
        Given the ledger should refuse one Batch signature alone and accept the Batch of "BA" with both phones combined

    Scenario: Second phone: switch back to Xahau Testnet
        Given this is the "second" phone of a two phone run
        Then I tap 'network-switch-button'
        Given I should have 'switch-network-overlay'
        Then I tap 'network-XAHAUTESTNET'
        Given I should have 'home-tab-view'
