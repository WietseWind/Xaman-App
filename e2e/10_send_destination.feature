Feature: Send destination lookup
    # Partial / messy paste used to match the r-address regex, throw in
    # NormalizeDestination, and leave the recipient step spinning without
    # ever calling handle-lookup.

    Scenario: Open send recipient
        Then I tap 'tab-Home'
        Given I should have 'home-tab-view'
        Then I tap 'send-button'
        Given I should have 'send-details-view'
        Then I enter '1' in 'amount-input'
        Then I tap 'next-button'
        Given I should have 'send-recipient-view'

    Scenario: Partial r-address does not spin forever
        Then I enter 'rwietsevLFg8XSmG3bEZzFein1g8RB' in 'recipient-search-input'
        Given I should have 'recipient-no-search-result'

    Scenario: Address with surrounding spaces resolves
        Then I tap 'clear-search-button'
        Then I enter ' rJ9uJ32u3Y46RenZrfvdYWjVf5ReKwf5Wr ' in 'recipient-search-input'
        Given I should have 'recipient-rJ9uJ32u3Y46RenZrfvdYWjVf5ReKwf5Wr'

    Scenario: Bithomp URL extracts the account
        Then I tap 'clear-search-button'
        Then I enter 'https://bithomp.com/account/rJ9uJ32u3Y46RenZrfvdYWjVf5ReKwf5Wr' in 'recipient-search-input'
        Given I should have 'recipient-rJ9uJ32u3Y46RenZrfvdYWjVf5ReKwf5Wr'
        Then I tap 'back-button'
        Then I tap 'back-button'
        Given I should have 'home-tab-view'
