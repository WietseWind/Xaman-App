/**
 * Crash reporter: the only path from JS to Firebase Crashlytics.
 *
 * - Installs the outermost global JS error handler. In release builds it scrubs the error in
 *   place (message, stack, name) before React Native Firebase, React Native and the native
 *   crash (RCTFatal / JavascriptException) ever see it, so all three carry the scrubbed text.
 * - Reports unhandled promise rejections (Hermes; RNFB's tracker hooks a Promise Hermes doesn't use).
 * - Records handled errors as non-fatals, with a stable issue name and per-session dedupe.
 * - Breadcrumbs and custom keys, scrubbed and short.
 *
 * Every string goes through ./scrub first. See docs/crash-reporting.md.
 */

import { NativeModules } from 'react-native';

import { scrubText, scrubStack, describeThrown, groupingName } from './scrub';
import { parseFrames } from './stack';

/* Types  ==================================================================== */
type NativeFrame = { src: string; line: number; col: number; fn: string; file: string };

export type NativeErrorPayload = {
    message: string;
    isUnhandledRejection: boolean;
    frames: NativeFrame[];
};

export type CrashlyticsNative = {
    isCrashlyticsCollectionEnabled?: boolean;
    recordErrorPromise?: (error: NativeErrorPayload) => Promise<unknown>;
    setAttribute?: (key: string, value: string) => Promise<unknown>;
    setAttributes?: (attributes: Record<string, string>) => Promise<unknown>;
    log?: (message: string) => void;
};

type GlobalHandler = (error: any, isFatal?: boolean) => void;

type ErrorUtilsLike = {
    getGlobalHandler: () => GlobalHandler;
    setGlobalHandler: (handler: GlobalHandler) => void;
};

type HermesLike = {
    hasPromise?: () => boolean;
    enablePromiseRejectionTracker?: (options: {
        allRejections: boolean;
        onUnhandled: (id: number, rejection: unknown) => void;
        onHandled: (id: number) => void;
    }) => void;
};

export type CrashReporterDeps = {
    release: boolean;
    native: () => CrashlyticsNative | undefined;
    errorUtils: () => ErrorUtilsLike | undefined;
    hermes: () => HermesLike | undefined;
    loadFirebaseHandlers: () => void;
};

type ReportOptions = {
    fatal?: boolean;
    context?: string;
    rejection?: boolean;
};

/* Constants  ==================================================================== */
// Crashlytics turns the closest earlier non-fatal into a fatal when this key is set (same as RNFB).
export const FATAL_FLAG = 'com.firebase.crashlytics.reactnative.fatal';
const MAX_REPORTS_PER_SESSION = 30;
const FATAL_RECORD_TIMEOUT_MS = 2000;
// Handled errors that are a user's choice, not a bug.
const BENIGN = /\b(?:user\s+cancel(?:l)?ed|cancel(?:l)?ed\s+by\s+(?:the\s+)?user)\b/i;

const defaultDeps: CrashReporterDeps = {
    release: !__DEV__,
    native: () => NativeModules.RNFBCrashlyticsModule as CrashlyticsNative | undefined,
    errorUtils: () => (global as any).ErrorUtils as ErrorUtilsLike | undefined,
    hermes: () => (global as any).HermesInternal as HermesLike | undefined,
    loadFirebaseHandlers: () => {
        // RNFB installs its own global handler when this module is first evaluated. Load it now so
        // ours is installed after it and stays outermost (firebase.json turns its reporting off).
        // eslint-disable-next-line global-require
        require('@react-native-firebase/crashlytics');
    },
};

const setProperty = (target: any, key: string, value: unknown): boolean => {
    try {
        // eslint-disable-next-line no-param-reassign
        target[key] = value;
    } catch {
        // frozen or accessor without setter
    }
    if (target[key] !== value) {
        try {
            Object.defineProperty(target, key, { value, writable: true, configurable: true, enumerable: false });
        } catch {
            return false;
        }
    }
    return target[key] === value;
};

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | undefined> =>
    new Promise((resolve) => {
        const timer = setTimeout(() => resolve(undefined), ms);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            () => {
                clearTimeout(timer);
                resolve(undefined);
            },
        );
    });

/* Reporter  ==================================================================== */
export class Reporter {
    private readonly deps: CrashReporterDeps;
    private handler?: GlobalHandler;
    private reported: Map<string, number>;
    private forwarded: WeakSet<object>;
    private installed: boolean;

    constructor(deps: Partial<CrashReporterDeps> = {}) {
        this.deps = { ...defaultDeps, ...deps };
        this.reported = new Map();
        this.forwarded = new WeakSet();
        this.installed = false;
    }

    /**
     * Install the global error handler and the rejection tracker. Safe to call more than once:
     * later calls only re-wrap when another handler was installed on top of ours.
     */
    install = () => {
        try {
            if (!this.installed) {
                this.installed = true;
                try {
                    this.deps.loadFirebaseHandlers();
                } catch {
                    // Crashlytics not available, nothing to wrap
                }
                this.trackRejections();
            }
            this.wrapGlobalHandler();
        } catch {
            // never break app start
        }
    };

    isCollecting = (): boolean => {
        try {
            return this.deps.native()?.isCrashlyticsCollectionEnabled === true;
        } catch {
            return false;
        }
    };

    /**
     * Record a handled error as a non-fatal. `context` names the place (constant text from code).
     */
    recordError = (error: unknown, context?: string) => {
        try {
            if (!this.isCollecting()) {
                return;
            }
            const copy = this.scrubbedCopy(error);
            if (BENIGN.test(copy.message)) {
                return;
            }
            this.report(copy, { context }).catch(() => undefined);
        } catch {
            // ignore
        }
    };

    /**
     * Short breadcrumb in the Crashlytics log of the next report. Never pass payloads or props.
     */
    breadcrumb = (message: string) => {
        try {
            const native = this.deps.native();
            if (!native?.log || !this.isCollecting()) {
                return;
            }
            native.log(scrubText(message, 200));
        } catch {
            // ignore
        }
    };

    /**
     * Custom keys shown on every following report.
     */
    setKeys = (keys: Record<string, string | number | boolean | undefined | null>) => {
        try {
            const native = this.deps.native();
            if (!native?.setAttributes || !this.isCollecting()) {
                return;
            }
            const attributes: Record<string, string> = {};
            Object.keys(keys).forEach((key) => {
                const value = keys[key];
                if (value !== undefined && value !== null) {
                    attributes[key.slice(0, 32)] = scrubText(String(value), 100);
                }
            });
            native.setAttributes(attributes).catch(() => undefined);
        } catch {
            // ignore
        }
    };

    /**
     * Scrub a thrown value for forwarding to the next global handler. Errors are scrubbed in place
     * (so React Native and the native crash carry the scrubbed text); anything else, or an error
     * that can't be changed, is replaced by a scrubbed Error.
     */
    scrubThrown = (value: unknown): Error => {
        if (!(value instanceof Error)) {
            return this.scrubbedCopy(value);
        }
        const message = scrubText(value.message, 2000);
        const stack = scrubStack(value.stack);
        const name = scrubText(value.name || 'Error', 80);
        const { componentStack } = value as any;
        let ok = setProperty(value, 'message', message) && setProperty(value, 'name', name);
        if (typeof value.stack === 'string') {
            ok = setProperty(value, 'stack', stack) && ok;
        }
        if (typeof componentStack === 'string') {
            ok = setProperty(value, 'componentStack', scrubStack(componentStack)) && ok;
        }
        return ok ? value : this.scrubbedCopy(value);
    };

    /**
     * A new Error with scrubbed message, name and stack; the original is left untouched.
     */
    scrubbedCopy = (value: unknown): Error => {
        let copy: Error;
        if (value instanceof Error) {
            copy = new Error(scrubText(value.message, 2000));
            copy.name = scrubText(value.name || 'Error', 80);
            setProperty(copy, 'stack', scrubStack(value.stack));
            if (typeof (value as any).componentStack === 'string') {
                setProperty(copy, 'componentStack', scrubStack((value as any).componentStack));
            }
        } else {
            copy = new Error(scrubText(describeThrown(value), 2000));
            copy.name = 'NonErrorThrown';
            // the stack of the copy points here, which says nothing about the throw site
            setProperty(copy, 'stack', `${copy.name}: ${copy.message}`);
        }
        return copy;
    };

    private wrapGlobalHandler = () => {
        const errorUtils = this.deps.errorUtils();
        if (!errorUtils) {
            return;
        }
        const previous = errorUtils.getGlobalHandler();
        if (this.handler && previous === this.handler) {
            return;
        }

        const handler: GlobalHandler = (error, isFatal) => {
            let forwarded: unknown = error;
            try {
                if (this.deps.release) {
                    forwarded = this.scrubThrown(error);
                }
            } catch {
                forwarded = new Error('Unreportable error');
            }

            const forward = () => {
                try {
                    previous(forwarded, isFatal);
                } catch {
                    // nothing left to do
                }
            };

            // already reported by an outer instance of this handler (after a re-wrap)
            const seen = typeof forwarded === 'object' && forwarded !== null && this.forwarded.has(forwarded);
            if (!this.isCollecting() || seen) {
                forward();
                return;
            }
            if (typeof forwarded === 'object' && forwarded !== null) {
                this.forwarded.add(forwarded);
            }

            const reported = this.report(this.scrubbedCopy(forwarded), { fatal: !!isFatal }).catch(() => undefined);
            if (isFatal) {
                // the next handler crashes the app: let the report reach native first
                withTimeout(reported, FATAL_RECORD_TIMEOUT_MS).then(forward, forward);
            } else {
                forward();
            }
        };

        this.handler = handler;
        errorUtils.setGlobalHandler(handler);
    };

    private trackRejections = () => {
        // Debug builds keep React Native's own tracker (LogBox warnings).
        if (!this.deps.release) {
            return;
        }
        const hermes = this.deps.hermes();
        if (!hermes?.enablePromiseRejectionTracker || !hermes.hasPromise?.()) {
            return;
        }
        hermes.enablePromiseRejectionTracker({
            allRejections: true,
            onUnhandled: (_id, rejection) => {
                try {
                    if (this.isCollecting()) {
                        this.report(this.scrubbedCopy(rejection), { rejection: true }).catch(() => undefined);
                    }
                } catch {
                    // ignore
                }
            },
            onHandled: () => undefined,
        });
    };

    /**
     * Build the RNFB native payload from an already scrubbed error.
     */
    buildPayload = (error: Error, options: ReportOptions): { name: string; payload: NativeErrorPayload } => {
        const message = scrubText(error.message, 1000);
        const stack = scrubStack(error.stack);
        const frames = parseFrames(stack);
        const context = options.context ? scrubText(options.context, 80) : undefined;
        const name = groupingName({
            context: options.rejection ? `Unhandled rejection${context ? ` ${context}` : ''}` : context,
            errorName: scrubText(error.name, 40),
            message,
            frames,
        });

        return {
            name,
            payload: {
                message: context ? `${context}: ${message}` : message,
                isUnhandledRejection: !!options.rejection,
                frames: [
                    // RNFB's convention for jsErrorName: a first frame whose file is the issue name.
                    // Crashlytics groups on it, so one bug stays one issue across builds and devices.
                    { src: '<unknown>', line: 0, col: 0, fn: '<unknown>', file: name },
                    ...frames.map((frame) => ({
                        src: '<unknown>',
                        line: frame.line,
                        col: frame.col,
                        fn: frame.fn || '<anonymous>',
                        file: `${frame.file}:${frame.line}:${frame.col}`,
                    })),
                ],
            },
        };
    };

    private report = async (error: Error, options: ReportOptions) => {
        const native = this.deps.native();
        if (!native?.recordErrorPromise) {
            return;
        }
        const { name, payload } = this.buildPayload(error, options);

        if (!options.fatal) {
            const seen = this.reported.get(name) ?? 0;
            this.reported.set(name, seen + 1);
            if (seen > 0 || this.reported.size > MAX_REPORTS_PER_SESSION) {
                return;
            }
        }

        if (options.fatal && native.setAttribute) {
            await native.setAttribute(FATAL_FLAG, `${Math.ceil(Date.now() / 1000) + 1}`);
        }
        await native.recordErrorPromise(payload);
    };
}

/* Export  ==================================================================== */
export default new Reporter();
