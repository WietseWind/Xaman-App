import React from 'react';
import { Animated, FlatList, InteractionManager, PanResponder, Text, TouchableWithoutFeedback } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { AndroidWindowSurroundContext } from '@common/helpers/androidWindowContext';

import WrappedActionPanel, { ActionPanel } from '../ActionPanel';
import KeyboardAwareScrollView from '../../KeyboardAwareScrollView/KeyboardAwareScrollView';

let mockSupports = false;
jest.mock('@common/helpers/androidMultiWindow', () => ({
    supportsAndroidMultiWindowLayout: () => mockSupports,
}));

describe('ActionPanel', () => {
    const springCallbacks: Array<(result: { finished: boolean }) => void> = [];

    beforeEach(() => {
        mockSupports = false;
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

    it('keeps a shifted short pane panel within its actual above-IME bounds', () => {
        const geometry = ActionPanel.getDerivedStateFromProps({
            height: 350, viewportHeight: 411, availableHeight: 150, offset: 230,
        });
        expect(geometry.snapPoints).toEqual([{ y: 411 }, { y: 20 }, { y: 0 }]);
        expect(geometry.panelHeight).toBe(130);
        expect(geometry.boundaries.top).toBe(0);
        geometry.snapPoints.slice(1).forEach(({ y }) => {
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y + geometry.panelHeight).toBeLessThanOrEqual(150);
        });
    });

    it('never adds an outer scroll view around caller-owned lists on a new Android build', () => {
        mockSupports = true;
        let tree: renderer.ReactTestRenderer;
        act(() => {
            tree = renderer.create(
                <AndroidWindowSurroundContext.Provider value={{
                    left: 0, width: 600, height: 400, columnWidth: 600, scale: 1, fullPane: true,
                }}>
                    <WrappedActionPanel height={300}>
                        <FlatList data={['public item']} renderItem={({ item }) => <Text>{item}</Text>} />
                    </WrappedActionPanel>
                </AndroidWindowSurroundContext.Provider>,
            );
        });
        expect(tree!.root.findAllByType(FlatList)).toHaveLength(1);
        expect(tree!.root.findAllByType(KeyboardAwareScrollView)).toHaveLength(0);
        act(() => tree!.unmount());
    });

    it('keeps pane snap targets, the imperative ref and the same draft through resizing', () => {
        mockSupports = true;
        const ref = React.createRef<ActionPanel>();
        const onSlideDown = jest.fn();
        class Draft extends React.Component<{}, { text: string }> {
            constructor(props: {}) {
                super(props);
                this.state = { text: '' };
            }
            render() {
                const { text } = this.state;
                return <Text>{text}</Text>;
            }
        }
        const render = (height?: number) => (
            <AndroidWindowSurroundContext.Provider value={height === undefined ? undefined : {
                left: 0, width: 600, height, columnWidth: 600, scale: 1, fullPane: true,
            }}>
                <WrappedActionPanel ref={ref} height={600} onSlideDown={onSlideDown}>
                    <Draft />
                </WrappedActionPanel>
            </AndroidWindowSurroundContext.Provider>
        );
        let tree: renderer.ReactTestRenderer;
        act(() => { tree = renderer.create(render(360)); });
        flushOpenDelay();
        const panel = ref.current!;
        const draft = tree!.root.findByType(Draft).instance;
        act(() => draft.setState({ text: 'public draft' }));
        expect((panel as any).state.snapPoints).toEqual([{ y: 360 }, { y: 20 }]);
        expect((panel as any).state.panelHeight).toBe(340);
        expect(tree!.root.findByType(ActionPanel).instance).toBe(panel);
        act(() => tree!.update(render(500)));
        expect((panel as any).state.snapPoints).toEqual([{ y: 500 }, { y: 20 }]);
        expect((panel as any).currentY).toBe(20);
        expect(tree!.root.findByType(Draft).instance).toBe(draft);
        expect(draft.state.text).toBe('public draft');
        act(() => panel.slideDown());
        flushOpenDelay();
        expect(jest.mocked(Animated.spring).mock.calls.at(-1)![1].toValue).toBe(500);
        act(() => springCallbacks.at(-1)!({ finished: true }));
        expect(onSlideDown).toHaveBeenCalledTimes(1);
        act(() => tree!.unmount());
    });

    it('reports actual animated displacement while a different snap target is pending', () => {
        let tree: renderer.ReactTestRenderer;
        act(() => { tree = renderer.create(<ActionPanel height={300} offset={150} />); });
        const panel = tree!.root.instance;
        const restingY = panel.state.snapPoints[1].y;
        act(() => { panel.translateY.setValue(restingY - 35); });
        expect(panel.offsetFromRest).toBe(35);
        act(() => { panel.snapTo(2); });
        flushOpenDelay();
        // The mocked native spring has a target but has not emitted another position.
        expect(panel.offsetFromRest).toBe(35);
        act(() => { panel.translateY.setValue(restingY + 20); });
        expect(panel.offsetFromRest).toBe(-20);
        act(() => { tree!.unmount(); });
    });

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
