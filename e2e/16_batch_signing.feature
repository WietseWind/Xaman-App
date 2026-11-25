Feature: Batch: what the app signs for a multi signer, for an inner account and for the Batch Account
    # A Batch (XLS-56, XRPL) with inner transactions of other accounts needs a BatchSigner of each of those
    # accounts, and the signature of the Batch Account. The app makes one of these in each sign request:
    #   - a multi sign request: a member of the signer list of the Batch Account signs the Batch. The result
    #     has Signers and an EMPTY SigningPubKey, as every multi signed transaction (issue 533: the store
    #     version removed the field, and the ledger refuses a transaction without it).
    #   - an inner account of someone else: its BatchSigner only, no signature of the Batch
    #   - the Batch Account at the last stage: a normal signed transaction with the collected BatchSigners
    #
    # Accounts, made for this run on XRPL Testnet (the rest of the suite is on Xahau Testnet, which has no
    # Batch). S and X are imported in the app:
    #   A  the Batch Account of the multi signed requests. Signer list: S. Not in the app.
    #   S  signer of A
    #   X  an inner account, and the Batch Account of the last scenario
    #   Y  an inner account, not in the app: it signs its BatchSigner outside the app
    #
    # The sign requests are real payloads of the Xaman platform API. They need an API key and secret in
    # .e2e-xaman-api.json (see e2e/helpers/signRequests.js); without it every scenario here is skipped.
    # Each signed result is read back from the API (the backend took the signature) and goes to the ledger.

    Background:
        Given sign requests can be created through the Xaman API
        Then I leave account import if open

    Scenario: Prepare the accounts on XRPL Testnet
        Then I prepare the Batch accounts

    # The app is on Xahau Testnet here: both accounts are not activated there, so the import explains it
    Scenario Outline: Import account <name> with its family seed
        Then I use the Batch account "<name>"
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
        Then I enter '<label>' in 'label-input'
        Then I tap 'next-button'
        Given I should have 'account-import-finish-view'
        Then I tap 'finish-button'
        Then I tap 'tab-Home'
        Given I should have 'home-tab-view'
        Given I should see same account address

        Examples:
            | name | label |
            | S    | BT-S  |
            | X    | BT-X  |

    Scenario: Switch the app to XRPL Testnet
        Then I tap 'network-switch-button'
        Given I should have 'switch-network-overlay'
        Then I tap 'network-TESTNET'
        # X was imported last: it is the account on Home, and it has a balance on this network
        Then I should wait 60 sec to see 'account-native-balance'

    # Issue 533. Two inner signers are still missing: the store version removed SigningPubKey here.
    Scenario: A multi sign request for a Batch that needs more inner signers: Signers and an empty SigningPubKey
        Then I create a multi sign request for a Batch of "A" with inner accounts "A,X,Y" for signer "S"
        Then I open the Batch sign request
        Given I should have 'review-transaction-modal'
        Then I scroll the review to the slide button
        Then I slide right 'accept-button'
        Then I type my passcode
        Given I should wait 30 sec to see 'signed-result-view'
        Then I tap 'close-button'
        Given the Batch should be multi signed by "S" with an empty SigningPubKey and no BatchSigners
        Given the ledger should accept the Batch with the BatchSigners of "X,Y" added

    Scenario: The same with the inner signatures collected in the request: they stay, next to Signers
        Then I create a multi sign request for a Batch of "A" with inner accounts "A,X,Y" for signer "S" with the BatchSigners of "X,Y"
        Then I open the Batch sign request
        Given I should have 'review-transaction-modal'
        Then I scroll the review to the slide button
        Then I slide right 'accept-button'
        Then I type my passcode
        Given I should wait 30 sec to see 'signed-result-view'
        Then I tap 'close-button'
        Given the Batch should be multi signed by "S" with an empty SigningPubKey and the BatchSigners of "X,Y"
        Given the ledger should accept the Batch as it is

    # Not multi sign: must stay as it is
    Scenario: An inner account of someone else signs: its BatchSigner only, no SigningPubKey, no TxnSignature
        Then I create a sign request for a Batch of "Y" with inner accounts "Y,X"
        Then I open the Batch sign request
        Given I should have 'review-transaction-modal'
        Then I scroll the review to the slide button
        Then I slide right 'accept-button'
        Then I type my passcode
        Given I should wait 30 sec to see 'signed-result-view'
        Then I tap 'close-button'
        Given the Batch should have only the BatchSigner of "X", and no signature of the Batch
        Given the ledger should accept the Batch after the Batch Account "Y" signed it

    Scenario: The last stage, the Batch Account signs: a normal signed transaction, and the app submits it
        Then I create a sign request for a Batch of "X" with inner accounts "X,Y" with the BatchSigners of "Y"
        Then I open the Batch sign request
        Given I should have 'review-transaction-modal'
        Then I scroll the review to the slide button
        Then I slide right 'accept-button'
        Then I type my passcode
        Given I should wait 60 sec to see 'success-result-view'
        Then I tap 'close-button'
        Given the Batch should have a normal signature of "X" and the BatchSigners of "Y"
        Given the ledger should have the Batch that the app submitted

    # The rest of the suite is on Xahau Testnet
    Scenario: Switch the app back to Xahau Testnet
        Then I tap 'network-switch-button'
        Given I should have 'switch-network-overlay'
        Then I tap 'network-XAHAUTESTNET'
        Given I should have 'home-tab-view'
