Feature: Remit: the review shows what it carries, and the ledger gets what was reviewed
    # A Remit (Xahau) can send amounts, transfer URITokens and mint a URIToken, all in one transaction, and
    # it pays for what it makes at the destination: the account itself, trust lines, URIToken reserves.
    # The review shows each part as a block of its own, "Extra fields" stays empty, and a caution above
    # the slide button lists what this Remit pays for at this destination (issue 530).
    #
    # Accounts, made for this run on Xahau Testnet (see e2e/helpers/remitLedger.js):
    #   sender    imported in the app. Holds 100 EUR of the issuer and two URITokens.
    #   issuer    issues EUR; also the account that the last Remit informs
    #   existing  a destination that exists, without a trust line at the start
    #   new accounts: addresses that are not on the ledger; a Remit activates them
    #
    # The sign requests are real payloads of the Xaman platform API. They need an API key and secret in
    # .e2e-xaman-api.json (see e2e/helpers/signRequests.js); without it every scenario here is skipped.
    # The app signs and submits each Remit; the test then reads the result from the ledger. The amount
    # that the caution names for the reserves is what the ledger took from the sender for them.

    Background:
        Given sign requests can be created through the Xaman API
        Then I leave account import if open

    Scenario: Prepare the accounts, the token and the URITokens
        Then I prepare the Remit accounts

    Scenario: Import the sender with its family seed
        Then I use the Remit sender account
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
        # the sender is on the ledger already: the import does not explain the activation
        Then I tap 'next-button'
        Given I should have 'account-import-security-view'
        Then I tap 'next-button'
        Given I should have 'account-import-label-view'
        Then I enter 'RM-Sender' in 'label-input'
        Then I tap 'next-button'
        Given I should have 'account-import-finish-view'
        Then I tap 'finish-button'
        Then I tap 'tab-Home'
        Given I should have 'home-tab-view'
        Given I should see same account address

    Scenario Outline: A Remit with <what>: reviewed, signed, and on the ledger
        Then I create a Remit sign request with "<what>"
        Then I open the Remit sign request
        Given I should wait 60 sec to see 'review-transaction-modal'
        Given the Remit review should show '<first block>'
        Given the Remit review showed no extra fields on the way
        Given the Remit caution should list "<the Remit pays for>"
        Then I slide right 'accept-button'
        Then I type my passcode
        Given I should wait 90 sec to see 'success-result-view'
        Then I tap 'close-button'
        Given the ledger should have the Remit with "<what>"

        Examples:
            | what                                 | first block              | the Remit pays for                    |
            | XAH to an account that exists        | remit-content-amount-0   | nothing                               |
            | XAH to a new account                 | remit-content-amount-0   | activation                            |
            | EUR to an account without trust line | remit-content-amount-0   | trust lines                           |
            | EUR to an account with trust line    | remit-content-amount-0   | nothing                               |
            | a URIToken                           | remit-content-uritoken-0 | URITokens                             |
            | a URIToken to mint                   | remit-content-mint       | URITokens                             |
            | everything to a new account          | remit-content-amount-0   | activation, trust lines, URITokens    |

    Scenario: A Remit with a URIToken that does not exist: every block shows, and the request is declined
        Then I create a Remit sign request with "a URIToken that does not exist"
        Then I open the Remit sign request
        Given I should wait 60 sec to see 'review-transaction-modal'
        Given the Remit review should show 'remit-content-amount-0'
        Given the Remit review should show 'remit-content-amount-1'
        Given the Remit review should show 'remit-content-uritoken-0'
        Given the Remit review should show 'remit-content-mint'
        Given the Remit review should show 'remit-pays-reserves-warning'
        Given the Remit review showed no extra fields on the way
        Then I close the Remit review and decline the request
        Given I should have 'home-tab-view'
