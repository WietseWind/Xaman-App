/**
 * The identity check of the KYC xApp (Veriff) runs in Veriff's web flow, in the browser of the phone.
 *
 * It ran in the native Veriff SDK of the app. On Android that SDK could no longer make a TLS connection
 * (it asked for TLS 1.1, which Android took out), and a newer SDK needs a much newer React Native. The SDK
 * is out of the app (issue 541).
 *
 * The KYC xApp opens the session link itself (the openBrowser command). An xApp page that still sends the
 * old kycVeriff command gets the same result through this helper: the session link opens in the browser,
 * and the xApp gets the kycVeriff answer when Xaman is in front again. The page then asks its backend for
 * the status: the result of a check never comes from the app.
 */

/* Constants ==================================================================== */
// https and a host under veriff.com or veriff.me, nothing that can end the URL in a page or a command
const VERIFF_SESSION_URL = /^https:\/\/([a-z0-9-]+\.)+veriff\.(com|me)\/[^\s"'<>\\]*$/;
const VERIFF_SESSION_URL_MAX = 2048;

// the status of the kycVeriff answer: not one of the native SDK (STATUS_DONE, STATUS_CANCELED, STATUS_ERROR)
export const KYC_BROWSER_STATUS = 'STATUS_BROWSER';

/* Types ==================================================================== */
export type KycBrowserActions = {
    // open the link in the browser of the phone
    openURL: (url: string) => Promise<unknown>;
    // Xaman is in front again after the browser: tell the xApp
    onReturn: () => void;
    // the phone could not open the link
    onFail: () => void;
};

/* Helpers ==================================================================== */
export const isVeriffSessionUrl = (url: unknown): url is string =>
    typeof url === 'string' && url.length <= VERIFF_SESSION_URL_MAX && VERIFF_SESSION_URL.test(url);

/* Class ==================================================================== */
export class KycBrowser {
    private readonly actions: KycBrowserActions;
    // the session link was sent to the browser, the answer for the xApp is still to come
    private pending = false;
    // Xaman left the foreground after that
    private left = false;

    constructor(actions: KycBrowserActions) {
        this.actions = actions;
    }

    /**
     * Open the session link in the browser.
     * @returns false when the link is not a session link of Veriff (nothing is opened)
     */
    start = (sessionUrl: unknown): boolean => {
        if (!isVeriffSessionUrl(sessionUrl)) {
            return false;
        }

        this.pending = true;
        this.left = false;

        let opened: Promise<unknown>;
        try {
            opened = Promise.resolve(this.actions.openURL(sessionUrl));
        } catch (error) {
            opened = Promise.reject(error);
        }
        opened.catch(() => {
            // only when this start is still the one that waits
            if (this.pending && !this.left) {
                this.pending = false;
                this.actions.onFail();
            }
        });

        return true;
    };

    /**
     * Xaman went to the background or came back.
     */
    onAppState = (active: boolean) => {
        if (!this.pending) {
            return;
        }
        if (!active) {
            this.left = true;
            return;
        }
        // in front again, and it was away: the user is back from the browser
        if (this.left) {
            this.pending = false;
            this.left = false;
            this.actions.onReturn();
        }
    };

    /**
     * The xApp screen closes or another xApp starts: no answer for a page that is gone.
     */
    reset = () => {
        this.pending = false;
        this.left = false;
    };
}
