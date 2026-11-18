Feature: An xApp comes back after the OS ended its page
    # The page of an xApp runs in a process of its own (web content on iOS, the WebView renderer on Android).
    # The OS can end that process, mostly after Xaman was in the background for a long time. The xApp screen
    # then stayed up with a blank page that did nothing. Xaman now starts the xApp again, with a new token.
    #
    # The test ID of the page shows a restart: 'xapp-webview', then 'xapp-webview-1', 'xapp-webview-2'.
    # Android: ending the renderer needs root on the device; without it those scenarios are skipped.

    Scenario: Open the support xApp
        Then I open the url 'https://xumm.app/detect/xapp:xumm.support'
        Given I should have 'xapp-browser-modal'
        Given I should wait 60 sec to see 'xapp-webview'

    Scenario: Switching to another app and back keeps the xApp as it is
        Then I send the app to the background
        Then I wait 3 sec and then bring the app to foreground
        Then I unlock the app if it is locked
        Given I should have 'xapp-webview'
        Given I should not have 'xapp-webview-1'

    Scenario: The OS ends the page while the xApp is open: the xApp is started again
        Then the OS ends the page process of the xApp
        Given I should wait 60 sec to see 'xapp-webview-1'

    Scenario: The OS ends the page while Xaman is in the background: the xApp is started again on return
        Then I send the app to the background
        Then the OS ends the page process of the xApp
        Then I wait 3 sec and then bring the app to foreground
        Then I unlock the app if it is locked
        Given I should wait 60 sec to see 'xapp-webview-2'

    Scenario: Close the xApp
        Then I tap 'close-button'
        Given I should have 'home-tab-view'
