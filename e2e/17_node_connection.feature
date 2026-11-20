Feature: The connection to the node: the app never gives up, and a review does not wait for it
    # The node of the network can not be reached for a while, and the phone still has a network (a node
    # that is down, Wi-Fi without a way out, a weak signal). The user comes back to the app in that time:
    # the app connects, and every attempt fails. On a network with one node the app used to stay
    # "Disconnected" until it was started again: its client stops after three attempts and could not be
    # started again. The app now makes a new connection, again and again, and it watches a connection that
    # is open but silent.
    #
    # The node is blocked on the device with iptables: an Android emulator with root only. On every other
    # device these scenarios are skipped. The suite is on Xahau Testnet here (one node: xahau-test.net).

    Background:
        Given this device can block the node of the network
        Then I leave account import if open

    Scenario: Back in the app while the node can not be reached: the app connects by itself when the node is back
        Then I tap 'tab-Home'
        Given I should have 'home-tab-view'
        Given the node connection should say "Connected" within 90 sec
        Then I leave the app, the node gets blocked, and I come back
        # three attempts of the client fail (about 12 seconds), then it gives up
        Given the node connection should say "Disconnected" within 90 sec
        Then I close the connection problem message if it shows
        # before the fix nothing happened any more from here, also after the node was back
        Given the node connection should stay "Disconnected" for 45 sec
        Then I unblock the node of the network
        Given the node connection should say "Connected" within 60 sec

    # The other way a connection dies: it is open, and the node says nothing any more. The app used to show
    # "Connected" for minutes (measured: 290 seconds, then the test stopped waiting) while every request
    # waited for its time-out.
    Scenario: The node goes silent while the app is open: the app notices, and connects again when the node is back
        Then I tap 'tab-Home'
        Given I should have 'home-tab-view'
        Given the node connection should say "Connected" within 90 sec
        Then I block the node of the network
        # the client closes a socket without a ledger after 10 seconds, the watch of the app sees it
        Given the node connection should say "Disconnected" within 90 sec
        Then I close the connection problem message if it shows
        Given the node connection should stay "Disconnected" for 45 sec
        Then I unblock the node of the network
        Given the node connection should say "Connected" within 60 sec

    Scenario: A Remit review while the node can not be reached: "up to" and the token ID, exact when it is back
        Then I tap 'tab-Home'
        Given I should have 'home-tab-view'
        Given the node connection should say "Connected" within 90 sec
        Then I leave the app, the node gets blocked, and I come back
        Given the node connection should say "Disconnected" within 90 sec
        Then I close the connection problem message if it shows
        Then I create a Remit sign request that needs the ledger for its review
        Then I open the sign request for the review
        Given I should have 'review-transaction-modal'
        Given the Remit review should show 'remit-content-uritoken-0'
        Given the URIToken card should show the token ID within 30 sec
        Given the Remit review should show 'remit-pays-reserves-warning'
        Given the Remit caution should say "up to", not an exact amount
        Then I unblock the node of the network
        Given the Remit caution should become exact within 90 sec
        Given the Remit caution should list "activation, URITokens"
        Then I close the Remit review and decline the request
        Given I should have 'home-tab-view'
