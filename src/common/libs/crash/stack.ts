/**
 * JS stack trace parsing for crash reports.
 *
 * Frame lines are produced by the JS engine from code (function name + location), so they
 * cannot carry runtime data. That lets the scrubber keep them untouched (bytecode offsets
 * are what symbolication needs) and only scrub the message part of a stack.
 */

export type StackFrame = {
    fn: string;
    file: string;
    line: number;
    col: number;
};

const FN = '(?:(?:new|async)\\s+)?[\\w$.?<>[\\]#-]{1,200}';
const LOCATION = '(?:address at\\s+)?([^()\\s]{1,300}):(\\d{1,9}):(\\d{1,9})';

// Hermes / V8: "    at fn (address at index.android.bundle:1:12345)"
const AT_WITH_FN = new RegExp(`^\\s*at\\s+(${FN})\\s+\\(${LOCATION}\\)$`);
// Hermes / V8 without a function name: "    at index.android.bundle:1:12345"
const AT_WITHOUT_FN = new RegExp(`^\\s*at\\s+${LOCATION}$`);
// Hermes native frame: "    at apply (native)"
const AT_NATIVE = new RegExp(`^\\s*at\\s+(${FN})\\s+\\(native\\)$`);
// JSC: "fn@file:1:2" and "fn@[native code]"
const JSC = new RegExp(`^(${FN})?@([^()\\s@]{1,300}):(\\d{1,9}):(\\d{1,9})$`);
const JSC_NATIVE = new RegExp(`^(${FN})?@\\[native code\\]$`);

const basename = (file: string): string => {
    const withoutQuery = file.split('?')[0];
    const parts = withoutQuery.split('/');
    return parts[parts.length - 1] || withoutQuery;
};

/**
 * Parse one stack line into a frame, or undefined when it is not a strict frame line.
 */
export const parseFrameLine = (line: string): StackFrame | undefined => {
    if (typeof line !== 'string' || line.length > 600) {
        return undefined;
    }

    let match = AT_WITH_FN.exec(line);
    if (match) {
        return { fn: match[1], file: basename(match[2]), line: Number(match[3]), col: Number(match[4]) };
    }

    match = AT_WITHOUT_FN.exec(line);
    if (match) {
        return { fn: '', file: basename(match[1]), line: Number(match[2]), col: Number(match[3]) };
    }

    match = AT_NATIVE.exec(line);
    if (match) {
        return { fn: match[1], file: 'native', line: 0, col: 0 };
    }

    match = JSC.exec(line);
    if (match) {
        return { fn: match[1] ?? '', file: basename(match[2]), line: Number(match[3]), col: Number(match[4]) };
    }

    match = JSC_NATIVE.exec(line);
    if (match) {
        return { fn: match[1] ?? '', file: 'native', line: 0, col: 0 };
    }

    return undefined;
};

export const isFrameLine = (line: string): boolean => parseFrameLine(line) !== undefined;

/**
 * All frames of a stack string, in order, at most `max`.
 */
export const parseFrames = (stack: unknown, max = 50): StackFrame[] => {
    if (typeof stack !== 'string' || !stack) {
        return [];
    }

    const frames: StackFrame[] = [];
    const lines = stack.split('\n');
    for (let i = 0; i < lines.length && frames.length < max; i++) {
        const frame = parseFrameLine(lines[i]);
        if (frame) {
            frames.push(frame);
        }
    }
    return frames;
};

// Frames that say nothing about where an error came from (RN internals, promise plumbing).
const GENERIC_FUNCTIONS = new Set([
    '',
    'anonymous',
    '<anonymous>',
    'apply',
    'call',
    'tryCallOne',
    'tryCallTwo',
    'doResolve',
    'Promise',
    'step',
    'next',
    'throw',
    '_next',
    '_throw',
    'asyncGeneratorStep',
    '__guard',
    '__callFunction',
    '__invokeCallback',
    'flushedQueue',
    'callFunctionReturnFlushedQueue',
    'invokeCallbackAndReturnFlushedQueue',
    '_callTimer',
    'callTimers',
    'callImmediates',
    '_callReactNativeMicrotasksPass',
    'callReactNativeMicrotasks',
    'guardedLoadModule',
    'loadModuleImplementation',
    'metroRequire',
]);

/**
 * First function name that identifies where an error was thrown (stable across builds).
 */
export const firstMeaningfulFunction = (frames: StackFrame[]): string | undefined => {
    for (const frame of frames) {
        const fn = frame.fn.replace(/^(?:new|async)\s+/, '');
        if (!GENERIC_FUNCTIONS.has(fn) && !fn.startsWith('?anon')) {
            return fn;
        }
    }
    return undefined;
};
