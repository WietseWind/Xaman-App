/**
 * The page of an xApp runs in a process of its own: the WebKit web content process on iOS, the WebView
 * renderer on Android. The OS can end that process, mostly after Xaman was in the background for a long
 * time or when memory is short. The view is then blank and does nothing, while the xApp screen is still up.
 *
 * This keeps track of that, so the xApp can be started again:
 * - the OS tells that the process is gone (iOS onContentProcessDidTerminate, Android onRenderProcessGone).
 *   While Xaman is not in front the restart waits until it is: a start needs the network and a new token;
 * - as a second line, after a long time away the page is asked for a sign of life. A page that is there
 *   answers at once; no answer in time counts as gone. A short switch to another app asks nothing.
 *
 * A page that keeps going away is not restarted forever: after a few restarts in a short time the caller is
 * told to give up (it shows the "unable to load" screen with Try again).
 */

/* Constants ==================================================================== */
// away from the foreground for at least this long: ask the page for a sign of life on return
export const PAGE_ALIVE_CHECK_AFTER_MS = 5 * 60 * 1000;
// how long the page has to answer
export const PAGE_ALIVE_TIMEOUT_MS = 5000;
// at most this many restarts within this time
export const PAGE_RESTARTS_IN_WINDOW = 2;
export const PAGE_RESTART_WINDOW_MS = 60 * 1000;

const PAGE_ALIVE_KEY = 'xamanPageAlive';

/* Types ==================================================================== */
export type PageWatchActions = {
    // start the xApp again (new token, new page)
    restart: () => void;
    // the page went away too often: stop and let the user decide
    giveUp: () => void;
    // run a script in the page
    inject: (script: string) => void;
    // the page is loaded and in use: only then a sign of life can be expected
    isPageInUse: () => boolean;
    now?: () => number;
};

/* Helpers ==================================================================== */
/**
 * The script that makes the page answer. It only posts a message, it does not touch the page.
 */
export const pageAliveScript = (id: string): string =>
    '(function(){try{window.ReactNativeWebView.postMessage(JSON.stringify({' +
    `${PAGE_ALIVE_KEY}:${JSON.stringify(id)}` +
    '}));}catch(e){}})();true;';

/**
 * The id in an answer of the page, or undefined when the message is something else.
 */
export const pageAliveAnswer = (data: unknown): string | undefined => {
    if (typeof data !== 'string' || data.indexOf(PAGE_ALIVE_KEY) === -1) {
        return undefined;
    }
    try {
        const parsed = JSON.parse(data);
        return typeof parsed?.[PAGE_ALIVE_KEY] === 'string' ? parsed[PAGE_ALIVE_KEY] : undefined;
    } catch {
        return undefined;
    }
};

/* Class ==================================================================== */
export class PageWatch {
    private readonly actions: PageWatchActions;
    private gonePending = false;
    private leftForegroundAt?: number;
    private restarts: number[] = [];
    private check?: { id: string; timer: ReturnType<typeof setTimeout> };
    private checks = 0;

    constructor(actions: PageWatchActions) {
        this.actions = actions;
    }

    private now = (): number => (this.actions.now ? this.actions.now() : Date.now());

    /**
     * Xaman came to the foreground, or left it.
     */
    onAppState = (active: boolean): void => {
        if (!active) {
            if (typeof this.leftForegroundAt === 'undefined') {
                this.leftForegroundAt = this.now();
            }
            // nothing can answer while Xaman is not in front
            this.clearCheck();
            return;
        }

        const away = typeof this.leftForegroundAt === 'number' ? this.now() - this.leftForegroundAt : 0;
        this.leftForegroundAt = undefined;

        if (this.gonePending) {
            this.gonePending = false;
            this.restart();
            return;
        }

        if (away >= PAGE_ALIVE_CHECK_AFTER_MS) {
            this.checkAlive();
        }
    };

    /**
     * The OS reports that the process of the page is gone.
     */
    onProcessGone = (appActive: boolean): void => {
        this.clearCheck();

        if (!appActive) {
            this.gonePending = true;
            return;
        }

        this.restart();
    };

    /**
     * A message of the page. Returns true when it was the answer to the sign of life check: it is then
     * not a message of the xApp.
     */
    onMessage = (data: unknown): boolean => {
        const id = pageAliveAnswer(data);
        if (typeof id === 'undefined') {
            return false;
        }
        if (this.check && this.check.id === id) {
            this.clearCheck();
        }
        return true;
    };

    /**
     * The xApp is started again by the user or by Xaman: forget what was waiting.
     */
    reset = (): void => {
        this.gonePending = false;
        this.clearCheck();
    };

    dispose = (): void => {
        this.reset();
    };

    private checkAlive = (): void => {
        if (!this.actions.isPageInUse()) {
            return;
        }

        this.clearCheck();
        this.checks += 1;
        const id = `${this.now()}-${this.checks}`;
        this.check = {
            id,
            timer: setTimeout(() => {
                this.check = undefined;
                // still in use and no answer: the page is gone
                if (this.actions.isPageInUse()) {
                    this.restart();
                }
            }, PAGE_ALIVE_TIMEOUT_MS),
        };
        this.actions.inject(pageAliveScript(id));
    };

    private clearCheck = (): void => {
        if (this.check) {
            clearTimeout(this.check.timer);
            this.check = undefined;
        }
    };

    private restart = (): void => {
        const now = this.now();
        this.restarts = this.restarts.filter((at) => now - at < PAGE_RESTART_WINDOW_MS);

        if (this.restarts.length >= PAGE_RESTARTS_IN_WINDOW) {
            this.actions.giveUp();
            return;
        }

        this.restarts.push(now);
        this.actions.restart();
    };
}
