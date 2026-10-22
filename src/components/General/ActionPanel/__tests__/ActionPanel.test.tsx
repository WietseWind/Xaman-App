import React from 'react';
import { Animated, InteractionManager, TouchableWithoutFeedback } from 'react-native';
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
});
