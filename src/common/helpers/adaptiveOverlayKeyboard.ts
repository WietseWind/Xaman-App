import { Keyboard as NativeKeyboard, NativeModules, Platform, View } from 'react-native';

import { AndroidWindowSurround } from './androidWindowContext';

type Options = {
    getContext: () => AndroidWindowSurround | undefined;
    getInput: () => View | null;
    getOffset: () => number;
    getAppliedOffset?: () => number;
    getRestingBottom?: (inputHeight: number, scale: number) => Promise<number | undefined>;
    setOffset: (offset: number, isCurrent: () => boolean) => void;
    onHide?: () => void;
};

// Android measures the transformed origin but returns the untransformed height.
// Keep an unshifted anchor while a sheet is animating, so duplicate Show events
// do not add the same overlap to an offset that has not reached its target yet.
export class AdaptiveOverlayKeyboard {
    private mounted = false;
    private closed = false;
    private session = false;
    private showIntent = false;
    private ownsHide = false;
    private revision = 0;
    private epoch = 0;
    private contextKey = '';
    private anchorBottom: number | undefined;
    private subscriptions: { remove: () => void }[] = [];

    private options: Options;

    constructor(options: Options) {
        this.options = options;
    }

    private getContext = () => {
        const context = this.options.getContext();
        return Platform.OS === 'android' && context && Number.isFinite(context.scale) && context.scale > 0
            ? context : undefined;
    };

    private key = (context?: AndroidWindowSurround) => (context
        ? [context.left, context.width, context.height, context.columnWidth, context.scale].join(':') : '');

    mount = () => {
        this.mounted = true;
        this.contextKey = this.key(this.getContext());
        if (Platform.OS === 'android') {
            this.subscriptions = [
                NativeKeyboard.addListener('keyboardDidShow', () => this.show(undefined, true)),
                NativeKeyboard.addListener('keyboardDidHide', this.hide),
            ];
        }
    };

    unmount = () => {
        this.cancel();
        this.mounted = false;
        this.subscriptions.forEach((subscription) => subscription.remove());
        this.subscriptions = [];
    };

    cancel = () => {
        this.closed = true;
        this.session = false;
        this.showIntent = false;
        this.ownsHide = false;
        this.revision += 1;
        this.epoch += 1;
        this.anchorBottom = undefined;
    };

    contextChanged = () => {
        const context = this.getContext();
        const key = this.key(context);
        if (key === this.contextKey) return;
        this.contextKey = key;
        this.revision += 1;
        this.epoch += 1;
        this.anchorBottom = undefined;
        if (!this.mounted || this.closed || !this.showIntent) return;
        if (context) {
            this.show(undefined, true);
        } else if (this.ownsHide && (this.session || this.options.getOffset() !== 0)) {
            this.session = false;
            this.options.onHide?.();
            const {epoch} = this;
            this.options.setOffset(0, () => this.mounted && !this.closed && epoch === this.epoch);
        }
    };

    focus = () => { this.show(undefined, true); };

    show = (legacyFallback?: (isCurrent: () => boolean) => void, requireVisible = false): boolean => {
        const context = this.getContext();
        if (!context) {
            // A new ordinary custom Show starts the original legacy ownership.
            if (legacyFallback) {
                if (this.ownsHide) this.options.onHide?.();
                this.ownsHide = false;
                this.showIntent = false;
                this.session = false;
                this.revision += 1;
                this.epoch += 1;
                this.anchorBottom = undefined;
            }
            return false;
        }
        if (!this.mounted || this.closed) return true;
        this.showIntent = true;

        if (this.key(context) !== this.contextKey) {
            this.contextKey = this.key(context);
            this.epoch += 1;
            this.anchorBottom = undefined;
        }
        const revision = ++this.revision;
        const {epoch} = this;
        const input = this.options.getInput();
        const key = this.key(context);
        const current = () => this.mounted && !this.closed && revision === this.revision &&
            key === this.key(this.getContext()) && input === this.options.getInput();
        const fallback = () => {
            if (current() && legacyFallback) {
                this.ownsHide = true;
                // A duplicate RN Show must not cancel the only usable custom
                // measurement when this older native module has no geometry API.
                const legacyCurrent = () => this.mounted && !this.closed && this.showIntent &&
                    !this.session && epoch === this.epoch && key === this.key(this.getContext()) &&
                    input === this.options.getInput();
                legacyFallback(legacyCurrent);
            }
        };
        const query = NativeModules.KeyboardModule?.getWindowGeometry;
        if (typeof query !== 'function' || !input) {
            fallback();
            return true;
        }

        Promise.resolve().then(() => query()).then((geometry) => {
            if (!current()) return;
            if (geometry?.visible === false) {
                this.hide();
                return;
            }
            if (!geometry || !Number.isFinite(geometry.keyboardTop) || geometry.keyboardTop <= 0) {
                fallback();
                return;
            }
            // An RN event has a different height protocol from our custom event.
            // Without explicit native visibility it must not invoke legacy math.
            if (requireVisible && geometry.visible !== true) return;

            input.measureInWindow((x, y, width, height) => {
                if (!current() || ![y, height].every(Number.isFinite) || height <= 0) return;
                const apply = (restingBottom?: number) => {
                    if (!current()) return;
                    if (this.anchorBottom === undefined) {
                        if (this.options.getRestingBottom) {
                            if (!Number.isFinite(restingBottom) || !(restingBottom! > 0)) return;
                            this.anchorBottom = restingBottom;
                        } else {
                            const applied = this.options.getAppliedOffset?.() ?? this.options.getOffset();
                            this.anchorBottom = y + height * context.scale + applied * context.scale;
                        }
                    }
                    this.session = true;
                    this.ownsHide = true;
                    const offset = Math.max(0, (this.anchorBottom! - geometry.keyboardTop) / context.scale);
                    const previousOffset = this.options.getOffset();
                    if (Math.abs(offset - previousOffset) < 0.5) return;
                    this.options.setOffset(offset, () => this.mounted && !this.closed && this.session &&
                        epoch === this.epoch && key === this.key(this.getContext()));
                };
                if (this.anchorBottom === undefined && this.options.getRestingBottom) {
                    Promise.resolve().then(() => this.options.getRestingBottom!(height, context.scale))
                        .then(apply).catch(() => undefined);
                } else apply();
            });
        }).catch(fallback);
        return true;
    };

    hide = (): boolean => {
        const hadIntent = this.showIntent;
        this.showIntent = false;
        this.revision += 1;
        this.anchorBottom = undefined;
        const owned = this.ownsHide;
        if (!this.mounted || this.closed) return owned || !!this.getContext();
        const reset = owned && (this.session || this.options.getOffset() !== 0);
        this.session = false;
        if (hadIntent || reset) this.epoch += 1;
        if (owned) this.options.onHide?.();
        if (reset) {
            const {epoch} = this;
            this.options.setOffset(0, () => this.mounted && !this.closed && !this.showIntent && epoch === this.epoch);
        }
        return owned;
    };
}
