import React from 'react';
import { Animated, InteractionManager, PanResponder, TouchableWithoutFeedback } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import ActionPanel from '../ActionPanel';

describe('ActionPanel', () => {
    const springCallbacks: Array<(result: { finished: boolean }) => void> = [];

    beforeEach(() => {
        springCallbacks.length = 0;
        jest.useFakeTimers();

        jest.spyOn(Animated, 'spring').mockImplementation(() => {
            return {
                start: (callback?: (result: { finished: boolean }) => void) => {
                    if (callback) {
                        springCallbacks.push(callback);
                    }
                },
                stop: jest.fn(),
                reset: jest.fn(),
            } as unknown as Animated.CompositeAnimation;
        });

        jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((task: any) => {
            if (typeof task === 'function') {
                task();
            }
            return {
                then: (resolve: any) => Promise.resolve(resolve && resolve()),
                done: jest.fn(),
                cancel: jest.fn(),
            } as any;
        });
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    const flushOpenDelay = () => {
        act(() => {
            jest.advanceTimersByTime(50);
        });
    };

    it.each([['release', 0], ['terminate', 0], ['release', 1], ['terminate', 1]])(
        'reports a header %s after its actual target %s is selected', (ending, target) => {
            let handlers: any;
            jest.spyOn(PanResponder, 'create').mockImplementation((callbacks) => {
                handlers = callbacks;
                return { panHandlers: {} } as any;
            });
            const events: string[] = [];
            const onCloseRequest = jest.fn(() => events.push('close'));
            const onDragEnd = jest.fn(() => events.push('end'));
            let tree: renderer.ReactTestRenderer;
            act(() => {
                tree = renderer.create(
                    <ActionPanel height={300} onCloseRequest={onCloseRequest} onDragEnd={onDragEnd} />,
                );
            });
            flushOpenDelay();
            const panel = tree!.root.instance;
            expect(panel.isDragActive).toBe(false);
            act(() => { handlers.onPanResponderGrant(); });
            expect(panel.isDragActive).toBe(true);
            expect(onCloseRequest).not.toHaveBeenCalled();
            // Native Animated.Value positions are fixture inputs; target selection stays real.
            panel.currentY = panel.state.snapPoints[Number(target)].y;
            act(() => {
                const callback = ending === 'release'
                    ? handlers.onPanResponderRelease : handlers.onPanResponderTerminate;
                callback({}, { vy: 0 });
            });
            expect(panel.isDragActive).toBe(false);
            expect(panel.currentIndex).toBe(target);
            expect(events).toEqual(target === 0 ? ['close', 'end'] : ['end']);
            expect(onDragEnd).toHaveBeenCalledTimes(1);
            act(() => { tree!.unmount(); });
        },
    );

    it('does not report a drag end for a programmatic close or unmount', () => {
        const onDragEnd = jest.fn();
        let tree: renderer.ReactTestRenderer;
        act(() => { tree = renderer.create(<ActionPanel height={300} onDragEnd={onDragEnd} />); });
        flushOpenDelay();
        const panel = tree!.root.instance;
        act(() => { panel.slideDown(); });
        flushOpenDelay();
        act(() => { tree!.unmount(); });
        expect(panel.isDragActive).toBe(false);
        expect(onDragEnd).not.toHaveBeenCalled();
    });

    it('does not dismiss when the open animation finishes', () => {
        const onSlideDown = jest.fn();

        act(() => {
            renderer.create(
                <ActionPanel height={300} onSlideDown={onSlideDown}>
                    {null}
                </ActionPanel>,
            );
        });

        flushOpenDelay();

        act(() => {
            springCallbacks[0]({ finished: true });
        });

        expect(onSlideDown).not.toHaveBeenCalled();
    });

    it('dismisses a close that interrupts the open animation', () => {
        const onSlideDown = jest.fn();
        let tree: renderer.ReactTestRenderer;

        act(() => {
            tree = renderer.create(
                <ActionPanel height={300} onSlideDown={onSlideDown} testID="home-actions-overlay">
                    {null}
                </ActionPanel>,
            );
        });

        flushOpenDelay();
        expect(springCallbacks).toHaveLength(1);

        act(() => {
            tree.root.findByType(TouchableWithoutFeedback).props.onPress();
        });
        flushOpenDelay();

        // The interrupted open spring must not dismiss, and must not block the close.
        act(() => {
            springCallbacks[0]({ finished: false });
        });
        expect(onSlideDown).not.toHaveBeenCalled();

        act(() => {
            springCallbacks[1]({ finished: true });
        });
        expect(onSlideDown).toHaveBeenCalledTimes(1);
    });

    it('does not reopen after a close that happens before the open animation starts', () => {
        const onSlideDown = jest.fn();
        let tree: renderer.ReactTestRenderer;
        const runAfterInteractions = InteractionManager.runAfterInteractions as jest.Mock;
        runAfterInteractions.mockImplementation(() => {
            return { then: jest.fn(), done: jest.fn(), cancel: jest.fn() };
        });

        act(() => {
            tree = renderer.create(
                <ActionPanel height={300} onSlideDown={onSlideDown}>
                    {null}
                </ActionPanel>,
            );
        });

        act(() => {
            tree.root.findByType(TouchableWithoutFeedback).props.onPress();
        });
        flushOpenDelay();

        const slideUp = tree.root.instance.slideUp as () => void;
        act(() => {
            slideUp();
        });
        flushOpenDelay();

        expect(springCallbacks).toHaveLength(1);
        act(() => {
            springCallbacks[0]({ finished: true });
        });
        expect(onSlideDown).toHaveBeenCalledTimes(1);
    });

    it('reports a close request synchronously once and completion only when the close finishes', () => {
        const onCloseRequest = jest.fn();
        const onSlideDown = jest.fn();
        let tree: renderer.ReactTestRenderer;
        act(() => {
            tree = renderer.create(
                <ActionPanel height={300} onCloseRequest={onCloseRequest} onSlideDown={onSlideDown} />,
            );
        });
        flushOpenDelay();
        act(() => {
            tree.root.findByType(TouchableWithoutFeedback).props.onPress();
            tree.root.instance.slideDown();
        });
        expect(onCloseRequest).toHaveBeenCalledTimes(1);
        expect(onSlideDown).not.toHaveBeenCalled();
        flushOpenDelay();
        act(() => { springCallbacks[1]({ finished: true }); });
        expect(onSlideDown).toHaveBeenCalledTimes(1);
    });

    it('reports a close reached through a snap/drag without changing the completion contract', () => {
        const onCloseRequest = jest.fn();
        const onSlideDown = jest.fn();
        let tree: renderer.ReactTestRenderer;
        act(() => {
            tree = renderer.create(
                <ActionPanel height={300} onCloseRequest={onCloseRequest} onSlideDown={onSlideDown} />,
            );
        });
        flushOpenDelay();
        act(() => { tree.root.instance.snapTo(0); });
        flushOpenDelay();
        expect(onCloseRequest).toHaveBeenCalledTimes(1);
        expect(onSlideDown).not.toHaveBeenCalled();
        act(() => { springCallbacks[1]({ finished: false }); });
        expect(onSlideDown).not.toHaveBeenCalled();
        act(() => { tree.root.instance.snapTo(0); });
        flushOpenDelay();
        act(() => { springCallbacks[2]({ finished: true }); });
        expect(onCloseRequest).toHaveBeenCalledTimes(1);
        expect(onSlideDown).toHaveBeenCalledTimes(1);
    });

    it.each([false, true])('only locks a requested close when lockAfterCloseRequest=%s', (locked) => {
        const onSlideDown = jest.fn();
        let tree: renderer.ReactTestRenderer;
        act(() => {
            tree = renderer.create(
                <ActionPanel height={300} lockAfterCloseRequest={locked} onSlideDown={onSlideDown} />,
            );
        });
        flushOpenDelay();
        const openY = jest.mocked(Animated.spring).mock.calls[0][1].toValue;
        act(() => { tree.root.instance.slideDown(); });
        flushOpenDelay();
        const closedY = jest.mocked(Animated.spring).mock.calls[1][1].toValue;
        act(() => { tree.root.instance.snapTo(1); });
        flushOpenDelay();
        expect(jest.mocked(Animated.spring).mock.calls[2][1].toValue).toBe(locked ? closedY : openY);
        act(() => { springCallbacks[2]({ finished: true }); });
        expect(onSlideDown).toHaveBeenCalledTimes(locked ? 1 : 0);
    });
});
