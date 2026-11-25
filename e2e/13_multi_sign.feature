Feature: Multi sign: the accounts the review offers, and what the ledger says about the result
    # A multi signature is made by a member of the signer list of the transaction Account, never by
    # that Account itself: the ledger refuses it ("Invalid multisigner"), also when the regular key of
    # the Account signs (issue 504). The review asks the ledger for the signer list and offers only the
    # accounts that can sign (issue 511).
    #
    # Accounts, made for this run. S, M and A are imported in the app with full access:
    #   A  the transaction Account. Signer list: S and M (quorum 1). Regular key: S.
    #   S  signer of A, and the regular key of A
    #   M  signer of A. Its own signer list: Q.
    #   Q  not in the app
    #   B  not in the app. Signer list: A (so A signs for B, with its own key or with its regular key S)
    #   D  not in the app. Signer list: S and M, quorum 2 (both have to sign)
    #
    # The sign requests are real payloads of the Xaman platform API on Xahau Testnet. They need an API
    # key and secret in .e2e-xaman-api.json (see e2e/helpers/signRequests.js); without it every scenario
    # here is skipped. Each signed result is read back from the API and goes to the ledger.

    Background:
        Given sign requests can be created through the Xaman API
        Then I leave account import if open

    Scenario: Prepare the accounts
        Then I prepare the multi sign accounts "A,S,M,Q,B,D"

    Scenario Outline: Import account <name> with its family seed
        Then I use the multi sign account "<name>"
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
            | S    | MS-S  |
            | M    | MS-M  |
            | A    | MS-A  |

    Scenario: Activate A and give it the signer list and the regular key
        # A was imported last: it is the account on Home, and the default account
        Given I should see 'not-activated-account-container'
        Then I give account "A" the signers "S,M" and the regular key "S" on the ledger
        Then I should wait 60 sec to see 'account-native-balance'
        Then I give account "M" the signers "Q" on the ledger
        Then I give account "B" the signers "A" on the ledger
        Then I give account "D" the signers "S,M" with quorum 2 on the ledger

    # Not multi sign: must stay as it is (issue 67). It also proves that the app knows the regular key of A.
    Scenario: A normal request with the regular key as forced signer is signed for A with the key of S
        Then I create a sign request for account "A" with forced signers "S"
        Then I open the sign request
        Given I should have 'review-transaction-modal'
        Given the review should sign as account "A"
        Given the review should offer no other account
        Then I scroll up 'review-content-container'
        Given I should see 'accept-button'
        Then I slide right 'accept-button'
        Then I pick the regular key "S" to sign with
        Then I type my passcode
        Given I should see 'submitting-view'
        Given I should wait 30 sec to see 'success-result-view'
        Then I tap 'close-button'
        Given the sign request should have a normal signature for account "A" with the key of account "S"
        Given the ledger should accept the signed transaction

    # Issue 504: the review used to switch to A here, and the signature was made as A
    Scenario: A multi sign request with the regular key of A as forced signer is signed as S
        Then I create a multi sign request for account "A" with forced signers "S"
        Then I open the sign request
        Given I should have 'review-transaction-modal'
        Given the review should sign as account "S"
        Given the review should offer no other account
        Then I scroll up 'review-content-container'
        Given I should see 'accept-button'
        Then I slide right 'accept-button'
        Then I type my passcode
        Given I should wait 30 sec to see 'signed-result-view'
        Then I tap 'close-button'
        Given the sign request should be multi signed as account "S" with the key of account "S"
        Given the ledger should accept the signed transaction

    Scenario: With two forced signers the review offers both and not A, and the picked one signs as itself
        Then I create a multi sign request for account "A" with forced signers "S,M"
        Then I open the sign request
        Given I should have 'review-transaction-modal'
        Given the review should sign as account "S"
        Then I open the account list of the review
        Given the account list should offer account "S"
        Given the account list should offer account "M"
        Given the account list should not offer account "A"
        Then I pick account "M" in the account list
        Then I scroll up 'review-content-container'
        Given I should see 'accept-button'
        Then I slide right 'accept-button'
        Then I type my passcode
        Given I should wait 30 sec to see 'signed-result-view'
        Then I tap 'close-button'
        Given the sign request should be multi signed as account "M" with the key of account "M"
        Given the ledger should accept the signed transaction

    # Issue 511. A is the default account here and the app has many more accounts: the review used to
    # start with A, and offered every account.
    Scenario: Without forced signers the review offers only the signers of A and starts with one of them
        Then I create a multi sign request for account "A" without forced signers
        Then I open the sign request
        Given I should have 'review-transaction-modal'
        Given the review should sign as account "S"
        Then I open the account list of the review
        Given the account list should offer account "S"
        Given the account list should offer account "M"
        Given the account list should not offer account "A"
        Then I pick account "S" in the account list
        Then I scroll up 'review-content-container'
        Given I should see 'accept-button'
        Then I slide right 'accept-button'
        Then I type my passcode
        Given I should wait 30 sec to see 'signed-result-view'
        Then I tap 'close-button'
        Given the sign request should be multi signed as account "S" with the key of account "S"
        Given the ledger should accept the signed transaction

    # A signer that signs with its regular key: the signer is A, the key is the key of S
    Scenario: A signer picks its regular key and the request is signed as the signer
        Then I create a multi sign request for account "B" with forced signers "A"
        Then I open the sign request
        Given I should have 'review-transaction-modal'
        Given the review should sign as account "A"
        Given the review should offer no other account
        Then I scroll up 'review-content-container'
        Given I should see 'accept-button'
        Then I slide right 'accept-button'
        Then I pick the regular key "S" to sign with
        Then I type my passcode
        Given I should wait 30 sec to see 'signed-result-view'
        Then I tap 'close-button'
        Given the sign request should be multi signed as account "A" with the key of account "S"
        Given the ledger should accept the signed transaction

    # Two signers for one transaction: each signs its own request for the same transaction
    Scenario: Quorum 2, the first signer signs
        Then I start collecting signatures
        Then I create a multi sign request for account "D" with forced signers "S"
        Then I open the sign request
        Given I should have 'review-transaction-modal'
        Given the review should sign as account "S"
        Then I scroll up 'review-content-container'
        Given I should see 'accept-button'
        Then I slide right 'accept-button'
        Then I type my passcode
        Given I should wait 30 sec to see 'signed-result-view'
        Then I tap 'close-button'
        Given the sign request should be multi signed as account "S" with the key of account "S"
        Then I keep the signed transaction

    Scenario: Quorum 2, the second signer signs and the ledger accepts both signatures together
        Then I create a multi sign request for account "D" with forced signers "M"
        Then I open the sign request
        Given I should have 'review-transaction-modal'
        Given the review should sign as account "M"
        Then I scroll up 'review-content-container'
        Given I should see 'accept-button'
        Then I slide right 'accept-button'
        Then I type my passcode
        Given I should wait 30 sec to see 'signed-result-view'
        Then I tap 'close-button'
        Given the sign request should be multi signed as account "M" with the key of account "M"
        Then I keep the signed transaction
        Given the ledger should refuse one kept signature alone, below the quorum
        Given the ledger should accept the kept signatures combined

    Scenario: A request that only an account outside the app can sign stops with a message
        # the signer list of M is Q, and Q is not in the app
        Then I create a multi sign request for account "M" without forced signers
        Then I open the sign request
        Given the review should say that none of my accounts can sign
        Then I close the stopped review and decline the request
        Given I should have 'home-tab-view'

    Scenario: An account can not multi sign for itself: the request stops with a message
        Then I create a multi sign request for account "A" with forced signers "A"
        Then I open the sign request
        Given the review should say that none of my accounts can sign
        Then I close the stopped review and decline the request
        Given I should have 'home-tab-view'
