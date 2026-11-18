/**
 * The page of an xApp can be ended by the OS while the xApp screen stays up (blank). PageWatch decides
 * when the xApp is started again, and when not: a normal switch to another app must change nothing.
 */
import {
    PageWatch,
    pageAliveAnswer,
    pageAliveScript,
    PAGE_ALIVE_CHECK_AFTER_MS,
    PAGE_ALIVE_TIMEOUT_MS,
    PAGE_RESTART_WINDOW_MS,
} from '../pageWatch';

const MINUTE = 60 * 1000;

const setup = (inUse = true) => {
    const state = { inUse };
    const actions = {
        restart: jest.fn(),
        giveUp: jest.fn(),
        inject: jest.fn(),
        isPageInUse: jest.fn(() => state.inUse),
    };
    const watch = new PageWatch(actions);
    // the id of the last sign of life check
    const lastCheckId = () => {
        const script = actions.inject.mock.calls[actions.inject.mock.calls.length - 1][0] as string;
        return /xamanPageAlive:"([^"]+)"/.exec(script)![1];
    };
    const answer = (id = lastCheckId()) => watch.onMessage(JSON.stringify({ xamanPageAlive: id }));
    // Xaman goes to the background and comes back after this long
    const away = (ms: number) => {
        watch.onAppState(false);
        jest.advanceTimersByTime(ms);
        watch.onAppState(true);
    };
    return { watch, actions, state, answer, away, lastCheckId };
};

beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-18T12:00:00Z'));
});
afterEach(() => jest.useRealTimers());

describe('the OS reports that the process of the page is gone', () => {
    it('Xaman is in front: the xApp is started again at once', () => {
        const { watch, actions } = setup();

        watch.onProcessGone(true);

        expect(actions.restart).toHaveBeenCalledTimes(1);
        expect(actions.giveUp).not.toHaveBeenCalled();
    });

    it('Xaman is in the background: the start waits until Xaman is in front again', () => {
        const { watch, actions } = setup();

        watch.onAppState(false);
        watch.onProcessGone(false);
        jest.advanceTimersByTime(3 * 60 * MINUTE);
        expect(actions.restart).not.toHaveBeenCalled();

        watch.onAppState(true);
        expect(actions.restart).toHaveBeenCalledTimes(1);
        // the restart is the answer: no sign of life check on top of it
        expect(actions.inject).not.toHaveBeenCalled();
    });

    it('reported once: one restart, also when Xaman comes to the front several times', () => {
        const { watch, actions, away } = setup();

        watch.onAppState(false);
        watch.onProcessGone(false);
        watch.onAppState(true);
        away(1000);
        away(1000);

        expect(actions.restart).toHaveBeenCalledTimes(1);
    });

    it('a page that keeps going away is restarted twice within a minute, then given up', () => {
        const { watch, actions } = setup();

        watch.onProcessGone(true);
        jest.advanceTimersByTime(5000);
        watch.onProcessGone(true);
        expect(actions.restart).toHaveBeenCalledTimes(2);
        expect(actions.giveUp).not.toHaveBeenCalled();

        jest.advanceTimersByTime(5000);
        watch.onProcessGone(true);
        expect(actions.restart).toHaveBeenCalledTimes(2);
        expect(actions.giveUp).toHaveBeenCalledTimes(1);
    });

    it('restarts again later: the limit is per minute, not for ever', () => {
        const { watch, actions } = setup();

        watch.onProcessGone(true);
        watch.onProcessGone(true);
        jest.advanceTimersByTime(PAGE_RESTART_WINDOW_MS + 1000);
        watch.onProcessGone(true);

        expect(actions.restart).toHaveBeenCalledTimes(3);
        expect(actions.giveUp).not.toHaveBeenCalled();
    });
});

describe('switching to another app and back', () => {
    it.each([
        ['a second', 1000],
        ['a minute', MINUTE],
        ['just under the limit', PAGE_ALIVE_CHECK_AFTER_MS - 1],
    ])('away for %s: nothing is asked and nothing is restarted', (_, ms) => {
        const { actions, away } = setup();

        away(ms);
        jest.advanceTimersByTime(MINUTE);

        expect(actions.inject).not.toHaveBeenCalled();
        expect(actions.restart).not.toHaveBeenCalled();
    });

    it('away for a long time and the page answers: nothing is restarted', () => {
        const { actions, away, answer } = setup();

        away(3 * 60 * MINUTE);
        expect(actions.inject).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(PAGE_ALIVE_TIMEOUT_MS - 100);
        expect(answer()).toBe(true);
        jest.advanceTimersByTime(MINUTE);

        expect(actions.restart).not.toHaveBeenCalled();
    });

    it('away for a long time and the page does not answer: the xApp is started again', () => {
        const { actions, away } = setup();

        away(PAGE_ALIVE_CHECK_AFTER_MS);
        jest.advanceTimersByTime(PAGE_ALIVE_TIMEOUT_MS - 1);
        expect(actions.restart).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1);
        expect(actions.restart).toHaveBeenCalledTimes(1);
    });

    it('the time away counts from the moment Xaman left the foreground, also over several state changes', () => {
        const { watch, actions } = setup();

        watch.onAppState(false); // background
        jest.advanceTimersByTime(15000);
        watch.onAppState(false); // inactive, 15 seconds later
        jest.advanceTimersByTime(PAGE_ALIVE_CHECK_AFTER_MS - 15000);
        watch.onAppState(true);

        expect(actions.inject).toHaveBeenCalledTimes(1);
    });

    it('the page is not in use (loading, an error, a network switch): nothing is asked', () => {
        const { actions, away } = setup(false);

        away(3 * 60 * MINUTE);
        jest.advanceTimersByTime(MINUTE);

        expect(actions.inject).not.toHaveBeenCalled();
        expect(actions.restart).not.toHaveBeenCalled();
    });

    it('the xApp is started again by something else while the answer is awaited: no second restart', () => {
        const { actions, away, state } = setup();

        away(3 * 60 * MINUTE);
        state.inUse = false; // launching again
        jest.advanceTimersByTime(PAGE_ALIVE_TIMEOUT_MS);

        expect(actions.restart).not.toHaveBeenCalled();
    });

    it('Xaman leaves the foreground again before the answer: the check is dropped, not counted as gone', () => {
        const { watch, actions, away } = setup();

        away(3 * 60 * MINUTE);
        watch.onAppState(false);
        jest.advanceTimersByTime(PAGE_ALIVE_TIMEOUT_MS * 2);

        expect(actions.restart).not.toHaveBeenCalled();
    });

    it('the process is reported gone while the answer is awaited: one restart', () => {
        const { watch, actions, away } = setup();

        away(3 * 60 * MINUTE);
        watch.onProcessGone(true);
        jest.advanceTimersByTime(PAGE_ALIVE_TIMEOUT_MS);

        expect(actions.restart).toHaveBeenCalledTimes(1);
    });

    it('an answer to an earlier check does not stand in for the current one', () => {
        const { actions, away, answer, lastCheckId } = setup();

        away(3 * 60 * MINUTE);
        const first = lastCheckId();
        away(3 * 60 * MINUTE);
        expect(lastCheckId()).not.toBe(first);

        expect(answer(first)).toBe(true);
        jest.advanceTimersByTime(PAGE_ALIVE_TIMEOUT_MS);

        expect(actions.restart).toHaveBeenCalledTimes(1);
    });

    it('after reset or dispose nothing fires any more', () => {
        const { watch, actions, away } = setup();

        away(3 * 60 * MINUTE);
        watch.dispose();
        jest.advanceTimersByTime(PAGE_ALIVE_TIMEOUT_MS);
        watch.onAppState(false);
        watch.onProcessGone(false);
        watch.reset();
        watch.onAppState(true);

        expect(actions.restart).not.toHaveBeenCalled();
    });
});

describe('messages of the page', () => {
    it('the answer to the check is taken, a message of the xApp is not', () => {
        const { watch } = setup();

        expect(watch.onMessage(JSON.stringify({ xamanPageAlive: 'x' }))).toBe(true);
        expect(watch.onMessage(JSON.stringify({ command: 'ready' }))).toBe(false);
        expect(watch.onMessage('not json')).toBe(false);
        expect(watch.onMessage('xamanPageAlive but not json')).toBe(false);
        expect(watch.onMessage(JSON.stringify({ xamanPageAlive: 5 }))).toBe(false);
        expect(watch.onMessage(undefined)).toBe(false);
        expect(watch.onMessage({ xamanPageAlive: 'x' })).toBe(false);
    });

    it('the script only posts the answer, and the answer carries the id', () => {
        const script = pageAliveScript('id-1');
        const posted: string[] = [];
        // run the script as the page would
        // eslint-disable-next-line no-new-func
        new Function('window', script)({ ReactNativeWebView: { postMessage: (m: string) => posted.push(m) } });

        expect(posted).toHaveLength(1);
        expect(pageAliveAnswer(posted[0])).toBe('id-1');
    });

    it('the script does nothing in a page without the bridge', () => {
        // eslint-disable-next-line no-new-func
        expect(() => new Function('window', pageAliveScript('id-2'))({})).not.toThrow();
    });
});
