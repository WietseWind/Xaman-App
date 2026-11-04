import { generate } from 'xrpl-accountlib';

import { Reporter, CrashlyticsNative, FATAL_FLAG } from '../reporter';

const account = generate.familySeed({ algorithm: 'secp256k1' });
const SEED = account.secret.familySeed!;
const PRIVATE_KEY = account.keypair.privateKey!;

const flush = () =>
    new Promise((resolve) => {
        setImmediate(resolve);
    });

const setup = ({ release = true, collecting = true } = {}) => {
    const calls: string[] = [];
    const native: Required<CrashlyticsNative> = {
        isCrashlyticsCollectionEnabled: collecting,
        recordErrorPromise: jest.fn(async () => {
            calls.push('record');
            return null;
        }),
        setAttribute: jest.fn(async (key: string) => {
            calls.push(`attribute:${key}`);
            return null;
        }),
        setAttributes: jest.fn(async () => null),
        log: jest.fn(),
    };
    let globalHandler: (error: any, isFatal?: boolean) => void = jest.fn();
    const rnHandler = globalHandler as jest.Mock;
    const errorUtils = {
        getGlobalHandler: () => globalHandler,
        setGlobalHandler: (handler: any) => {
            globalHandler = handler;
        },
    };
    let tracker: any;
    const hermes = {
        hasPromise: () => true,
        enablePromiseRejectionTracker: jest.fn((options: any) => {
            tracker = options;
        }),
    };
    const reporter = new Reporter({
        release,
        native: () => native,
        errorUtils: () => errorUtils,
        hermes: () => hermes,
        loadFirebaseHandlers: () => undefined,
    });
    return {
        reporter,
        native,
        calls,
        rnHandler,
        hermes,
        errorUtils,
        tracker: () => tracker,
        throwGlobal: (error: any, isFatal?: boolean) => globalHandler(error, isFatal),
    };
};

const recorded = (native: Required<CrashlyticsNative>, index = 0) =>
    (native.recordErrorPromise as jest.Mock).mock.calls[index][0];

describe('Reporter global handler', () => {
    it('scrubs a fatal error in place before React Native sees it, and reports it first', async () => {
        const { reporter, native, calls, rnHandler, throwGlobal } = setup();
        reporter.install();

        const error = new Error(`could not sign with ${SEED} / ${PRIVATE_KEY}`);
        throwGlobal(error, true);
        await flush();
        await flush();

        // in place: React Native and the native crash get the scrubbed text
        expect(rnHandler).toHaveBeenCalledTimes(1);
        const forwarded = rnHandler.mock.calls[0][0];
        expect(forwarded).toBe(error);
        expect(error.message).toBe('could not sign with [redacted] / [redacted]');
        expect(error.stack).not.toContain(SEED);
        expect(error.stack).not.toContain(PRIVATE_KEY);
        expect(rnHandler.mock.calls[0][1]).toBe(true);

        // fatal flag first, then the record
        expect(calls).toEqual([`attribute:${FATAL_FLAG}`, 'record']);
        const payload = recorded(native);
        expect(JSON.stringify(payload)).not.toContain(SEED);
        expect(JSON.stringify(payload)).not.toContain(PRIVATE_KEY);
        expect(payload.isUnhandledRejection).toBe(false);
        expect(payload.frames[0].file).toBe('Error: could not sign with [redacted] / [redacted] @ Object.<anonymous>');
        expect(payload.frames.length).toBeGreaterThan(1);
    });

    it('forwards non-fatal errors right away', async () => {
        const { reporter, rnHandler, throwGlobal, native } = setup();
        reporter.install();
        throwGlobal(new Error('soft'), false);
        expect(rnHandler).toHaveBeenCalledTimes(1);
        await flush();
        expect(native.setAttribute).not.toHaveBeenCalled();
        expect(native.recordErrorPromise).toHaveBeenCalledTimes(1);
    });

    it('replaces a thrown string with a scrubbed Error', async () => {
        const { reporter, rnHandler, throwGlobal } = setup();
        reporter.install();
        throwGlobal(`seed ${SEED}`, true);
        await flush();
        await flush();
        const forwarded = rnHandler.mock.calls[0][0];
        expect(forwarded).toBeInstanceOf(Error);
        expect(forwarded.message).toBe('seed [redacted]');
        expect(forwarded.name).toBe('NonErrorThrown');
    });

    it('replaces an error it cannot change, and leaves the original alone', async () => {
        const { reporter, rnHandler, throwGlobal } = setup();
        reporter.install();
        const frozen = Object.freeze(new Error(`key ${PRIVATE_KEY}`));
        throwGlobal(frozen, true);
        await flush();
        await flush();
        const forwarded = rnHandler.mock.calls[0][0];
        expect(forwarded).not.toBe(frozen);
        expect(forwarded.message).toBe('key [redacted]');
        expect(frozen.message).toContain(PRIVATE_KEY);
    });

    it('does not wait forever for a report that never completes', async () => {
        jest.useFakeTimers();
        try {
            const { reporter, rnHandler, throwGlobal, native } = setup();
            // never settles
            (native.recordErrorPromise as jest.Mock).mockImplementation(() => new Promise(jest.fn()));
            reporter.install();
            throwGlobal(new Error('boom'), true);
            await Promise.resolve();
            await Promise.resolve();
            expect(rnHandler).not.toHaveBeenCalled();
            jest.advanceTimersByTime(2100);
            await Promise.resolve();
            await Promise.resolve();
            expect(rnHandler).toHaveBeenCalledTimes(1);
        } finally {
            jest.useRealTimers();
        }
    });

    it('leaves errors untouched in debug builds, but never sends them unscrubbed', async () => {
        const { reporter, rnHandler, throwGlobal, native } = setup({ release: false });
        reporter.install();
        const error = new Error(`seed ${SEED}`);
        throwGlobal(error, true);
        await flush();
        await flush();
        expect(rnHandler.mock.calls[0][0]).toBe(error);
        expect(error.message).toContain(SEED);
        expect(JSON.stringify(recorded(native))).not.toContain(SEED);
    });

    it('only forwards when collection is off', async () => {
        const { reporter, rnHandler, throwGlobal, native } = setup({ collecting: false });
        reporter.install();
        throwGlobal(new Error('x'), true);
        expect(rnHandler).toHaveBeenCalledTimes(1);
        expect(native.recordErrorPromise).not.toHaveBeenCalled();
    });

    it('wraps once, and wraps again when another handler took over', () => {
        const { reporter, errorUtils } = setup();
        reporter.install();
        const ours = errorUtils.getGlobalHandler();
        reporter.install();
        expect(errorUtils.getGlobalHandler()).toBe(ours);

        const intruder = jest.fn();
        errorUtils.setGlobalHandler(intruder);
        reporter.install();
        expect(errorUtils.getGlobalHandler()).not.toBe(intruder);
        expect(errorUtils.getGlobalHandler()).not.toBe(ours);
    });
});

describe('Reporter rejections', () => {
    it('reports unhandled rejections scrubbed, in release builds', async () => {
        const { reporter, hermes, tracker, native } = setup();
        reporter.install();
        expect(hermes.enablePromiseRejectionTracker).toHaveBeenCalledWith(
            expect.objectContaining({ allRejections: true }),
        );
        tracker().onUnhandled(1, new Error(`fetch failed for ${SEED}`));
        tracker().onUnhandled(2, `plain ${PRIVATE_KEY}`);
        await flush();
        expect(native.recordErrorPromise).toHaveBeenCalledTimes(2);
        const first = recorded(native, 0);
        expect(first.isUnhandledRejection).toBe(true);
        expect(first.message).toBe('fetch failed for [redacted]');
        expect(first.frames[0].file.startsWith('Unhandled rejection: Error: fetch failed for [redacted]')).toBe(true);
        expect(recorded(native, 1).message).toBe('plain [redacted]');
    });

    it('leaves the React Native tracker alone in debug builds', () => {
        const { reporter, hermes } = setup({ release: false });
        reporter.install();
        expect(hermes.enablePromiseRejectionTracker).not.toHaveBeenCalled();
    });
});

describe('Reporter handled errors, breadcrumbs, keys', () => {
    it('records a handled error once per session, with context, without touching the original', async () => {
        const { reporter, native } = setup();
        const error = new Error(`vault open failed ${PRIVATE_KEY}`);
        reporter.recordError(error, 'Unexpected error in sign process [PIN]');
        reporter.recordError(error, 'Unexpected error in sign process [PIN]');
        await flush();
        expect(native.recordErrorPromise).toHaveBeenCalledTimes(1);
        const payload = recorded(native);
        expect(payload.message).toBe('Unexpected error in sign process [PIN]: vault open failed [redacted]');
        expect(payload.frames[0].file.startsWith('Unexpected error in sign process [PIN]: Error:')).toBe(true);
        expect(error.message).toContain(PRIVATE_KEY);
    });

    it('skips user cancellations', async () => {
        const { reporter, native } = setup();
        reporter.recordError(new Error('The user cancelled the operation'), 'Tangem');
        await flush();
        expect(native.recordErrorPromise).not.toHaveBeenCalled();
    });

    it('scrubs breadcrumbs and keys', () => {
        const { reporter, native } = setup();
        reporter.breadcrumb(`link ${SEED}`);
        reporter.setKeys({ screen: 'Home', note: `x ${PRIVATE_KEY}`, developer_mode: true, empty: undefined });
        expect(native.log).toHaveBeenCalledWith('link [redacted]');
        expect(native.setAttributes).toHaveBeenCalledWith({
            screen: 'Home',
            note: 'x [redacted]',
            developer_mode: 'true',
        });
    });

    it('does nothing when collection is off', () => {
        const { reporter, native } = setup({ collecting: false });
        reporter.breadcrumb('x');
        reporter.setKeys({ a: 'b' });
        reporter.recordError(new Error('x'));
        expect(native.log).not.toHaveBeenCalled();
        expect(native.setAttributes).not.toHaveBeenCalled();
        expect(native.recordErrorPromise).not.toHaveBeenCalled();
    });
});
