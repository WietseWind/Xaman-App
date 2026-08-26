Feature: Family seed curve import on Xahau testnet
    # Isolated checks for family seed secp256k1 vs ed25519. Autodetect only
    # moves the picker to ed25519 when that account is activated and secp is
    # not. Next still has to be pressed.

    Background:
        Then I leave account import if open

    Scenario: Switch to Xahau testnet
        Then I tap 'tab-Home'
        Then I tap 'network-switch-button'
        Given I should have 'switch-network-overlay'
        Then I tap 'network-XAHAUTESTNET'

    Scenario: Family seed curve picker defaults to secp256k1
        Then I open the family seed import screen
        Then I generate new family seed
        Then I enter my seed in the input
        Then I remember family seed address for curve "secp256k1"
        Given I should see family seed curve "secp256k1"
        Then I tap 'next-button'
        Then I should confirm expected family seed address

    Scenario: Family seed curve picker can select ed25519
        Then I open the family seed import screen
        Then I generate new family seed
        Then I enter my seed in the input
        Then I remember family seed address for curve "ed25519"
        Given I should see family seed curve "secp256k1"
        Then I choose family seed curve "ed25519"
        Then I tap 'next-button'
        Then I should confirm expected family seed address

    Scenario: Autodetect selects ed25519 when only that account is activated
        Then I open the family seed import screen
        Then I generate new family seed
        Then I remember family seed address for curve "ed25519"
        Then I activate expected family seed address
        Then I enter my seed in the input
        Given I should see family seed curve "ed25519"
        Then I tap 'next-button'
        Then I should confirm expected family seed address
