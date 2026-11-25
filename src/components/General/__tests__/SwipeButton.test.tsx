/**
 * SwipeButton with a screen reader on: the swipe becomes a button that must hold back exactly like
 * the swipe does. The review screen keeps Accept disabled until the scam check is done.
 */
import React from 'react';
import { AccessibilityInfo, TouchableOpacity, View } from 'react-native';
import renderer, { act, ReactTestRenderer } from 'react-test-renderer';

import SwipeButton from '../SwipeButton/SwipeButton';

const flush = () =>
    new Promise<void>((resolve) => {
        setImmediate(resolve);
    });

const render = async (screenReader: boolean, props: Partial<React.ComponentProps<typeof SwipeButton>> = {}) => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(screenReader);
    const onSwipeSuccess = jest.fn();
    let tree: ReactTestRenderer;
    await act(async () => {
        tree = renderer.create(
            <SwipeButton
                testID="accept-button"
                label="Slide to accept"
                accessibilityLabel="Accept"
                onSwipeSuccess={onSwipeSuccess}
                // eslint-disable-next-line react/jsx-props-no-spreading
                {...props}
            />,
        );
        await flush();
    });
    return { tree: tree!, onSwipeSuccess };
};

const button = (tree: ReactTestRenderer) => tree.root.findByType(TouchableOpacity);

describe('[SwipeButton] with a screen reader', () => {
    let now: number;

    beforeEach(() => {
        now = 1_000_000;
        jest.spyOn(Date, 'now').mockImplementation(() => now);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('is a button named by its accessibility label', async () => {
        const { tree } = await render(true);

        const { props } = button(tree);
        expect(props.accessibilityRole).toBe('button');
        expect(props.accessibilityLabel).toBe('Accept');
        expect(props.testID).toBe('accept-button');
        expect(props.accessibilityState).toEqual({ disabled: false });
    });

    it('does nothing while disabled, like the swipe (the scam check is still running)', async () => {
        const { tree, onSwipeSuccess } = await render(true, { isDisabled: true });

        const { props } = button(tree);
        expect(props.disabled).toBe(true);
        expect(props.accessibilityState).toEqual({ disabled: true });

        act(() => {
            props.onPress();
        });
        expect(onSwipeSuccess).not.toHaveBeenCalled();
    });

    it('works once the screen enables it', async () => {
        const { tree, onSwipeSuccess } = await render(true, { isDisabled: true });

        await act(async () => {
            tree.update(
                <SwipeButton
                    testID="accept-button"
                    label="Slide to accept"
                    accessibilityLabel="Accept"
                    onSwipeSuccess={onSwipeSuccess}
                    isDisabled={false}
                />,
            );
        });

        act(() => {
            button(tree).props.onPress();
        });
        expect(onSwipeSuccess).toHaveBeenCalledTimes(1);
    });

    it('ignores a second activation within a second', async () => {
        const { tree, onSwipeSuccess } = await render(true);

        act(() => {
            button(tree).props.onPress();
        });
        now += 500;
        act(() => {
            button(tree).props.onPress();
        });
        expect(onSwipeSuccess).toHaveBeenCalledTimes(1);

        now += 1000;
        act(() => {
            button(tree).props.onPress();
        });
        expect(onSwipeSuccess).toHaveBeenCalledTimes(2);
    });

    it('says busy and offers nothing to press while loading', async () => {
        const { tree } = await render(true, { isLoading: true });

        expect(tree.root.findAllByType(TouchableOpacity)).toHaveLength(0);
        const busy = tree.root.findAll(
            (node) => node.type === View && node.props.accessibilityState?.busy === true,
        );
        expect(busy).toHaveLength(1);
        expect(busy[0].props.accessibilityLabel).toBe('Accept');
        expect(busy[0].props.accessibilityState).toEqual({ disabled: true, busy: true });
    });

    it('falls back to the label when there is no accessibility label', async () => {
        const { tree } = await render(true, { accessibilityLabel: undefined });

        expect(button(tree).props.accessibilityLabel).toBe('Slide to accept');
    });
});

describe('[SwipeButton] without a screen reader', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('renders the swipe, not a button', async () => {
        const { tree } = await render(false);

        expect(tree.root.findAllByType(TouchableOpacity)).toHaveLength(0);
    });

    it('follows the screen reader being switched on and stops listening when unmounted', async () => {
        const remove = jest.fn();
        let listener: ((enabled: boolean) => void) | undefined;
        jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((event: any, handler: any) => {
            expect(event).toBe('screenReaderChanged');
            listener = handler;
            return { remove } as any;
        });

        const { tree } = await render(false);
        expect(tree.root.findAllByType(TouchableOpacity)).toHaveLength(0);

        await act(async () => {
            listener!(true);
        });
        expect(tree.root.findAllByType(TouchableOpacity)).toHaveLength(1);

        act(() => {
            tree.unmount();
        });
        expect(remove).toHaveBeenCalledTimes(1);
    });
});
