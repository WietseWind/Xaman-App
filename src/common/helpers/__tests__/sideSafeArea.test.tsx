/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
/**
 * Screens and a safe area on a side of the screen (issue 544, iPhone Duo).
 * Without such an area a screen is registered as it is: the same class, nothing around it.
 */
import React, { Component } from 'react';
import { Dimensions, Text, View } from 'react-native';
import renderer from 'react-test-renderer';

import { freeWidthFor, withSideInsets } from '../sideSafeArea';

class Screen extends Component<{ label: string }> {
    static screenName = 'app.Test';

    static options() {
        return { topBar: { visible: false } };
    }

    static get live() {
        return Screen.screenName;
    }

    render() {
        const { label } = this.props;
        return <Text>{label}</Text>;
    }
}

type Sizes = {
    sideInsets: number;
    leftInset: number;
    rightInset: number;
    screen: { windowWidth: number; uncorrectedWidth: number };
};

/** the module as it loads on a phone with these sizes */
const moduleWith = (sizes: Sizes): any => {
    let loaded: any;
    jest.isolateModules(() => {
        jest.doMock('@theme', () => ({ AppSizes: sizes }));
        // eslint-disable-next-line global-require
        loaded = require('../sideSafeArea');
    });
    return loaded;
};

const withAppSizes = (sizes: Sizes) => moduleWith(sizes).withSideSafeArea;

const NO_SIDE: Sizes = {
    sideInsets: 0,
    leftInset: 0,
    rightInset: 0,
    screen: { windowWidth: 390, uncorrectedWidth: 390 },
};
const DUO: Sizes = {
    sideInsets: 84,
    leftInset: 0,
    rightInset: 84,
    screen: { windowWidth: 466, uncorrectedWidth: 382 },
};

afterEach(() => {
    jest.dontMock('@theme');
});

describe('no safe area on a side: every phone but the iPhone Duo', () => {
    it('gives the screen itself', () => {
        expect(withSideInsets(Screen, { left: 0, right: 0 })).toBe(Screen);
        expect(withSideInsets(Screen, { left: -5, right: 0 })).toBe(Screen);
        expect(withSideInsets(Screen, { left: NaN, right: NaN })).toBe(Screen);
        expect(withSideInsets(Screen, {} as any)).toBe(Screen);
    });

    it('the app registers the screen itself', () => {
        const withSideSafeArea = withAppSizes(NO_SIDE);
        expect(withSideSafeArea(Screen)).toBe(Screen);
    });

    it('renders the same tree as the screen alone', () => {
        const Same = withSideInsets(Screen, { left: 0, right: 0 });
        expect(renderer.create(<Same label="a" />).toJSON()).toEqual(renderer.create(<Screen label="a" />).toJSON());
    });
});

describe('a safe area on a side: iPhone Duo', () => {
    const Wrapped = withSideInsets(Screen, { left: 0, right: 84 });

    it('keeps the screen out of it, and passes the props on', () => {
        const tree = renderer.create(<Wrapped label="hello" />);
        const root = tree.root.findAllByType(View)[0];
        expect(root.props.style).toEqual({ flex: 1, marginLeft: 0, marginRight: 84 });
        expect(root.props.pointerEvents).toBe('box-none');
        expect(tree.root.findByType(Screen).props).toEqual({ label: 'hello' });
        expect(tree.root.findByType(Text).props.children).toBe('hello');
    });

    it('takes both sides, and no negative side', () => {
        const Both = withSideInsets(Screen, { left: 40, right: -3 });
        const root = renderer.create(<Both label="x" />).root.findAllByType(View)[0];
        expect(root.props.style).toEqual({ flex: 1, marginLeft: 40, marginRight: 0 });
    });

    it('has the statics of the screen: the navigation library reads them', () => {
        const W = Wrapped as any;
        expect(W).not.toBe(Screen);
        expect(W.screenName).toBe('app.Test');
        expect(W.options()).toEqual({ topBar: { visible: false } });
        expect(W.live).toBe('app.Test');
        expect(W.displayName).toBe('SideSafeArea(Screen)');
        expect(W.prototype).not.toBe(Screen.prototype);
    });

    it('the app makes one wrapper for a screen, however often it is asked for', () => {
        const withSideSafeArea = withAppSizes(DUO);
        const first = withSideSafeArea(Screen);
        expect(first).not.toBe(Screen);
        expect(withSideSafeArea(Screen)).toBe(first);
        expect(first.displayName).toBe('SideSafeArea(Screen)');
        expect(first.screenName).toBe('app.Test');
    });
});

describe('backdrops: the dim or blur of an overlay goes on under the side safe area', () => {
    it('no safe area on a side: no style at all and nothing rendered', () => {
        const m = moduleWith(NO_SIDE);
        expect(m.sideBleedEdges).toBeUndefined();
        expect(m.sideBleedAbsolute).toBeUndefined();
        expect(m.sideBleedMargin).toBeUndefined();
        const { SideSafeAreaFill } = m;
        expect(renderer.create(<SideSafeAreaFill style={{ backgroundColor: 'black' }} />).toJSON()).toBeNull();
        // a backdrop with the fill in it renders the same tree as one without
        const plain = renderer.create(<View style={{ flex: 1 }} />).toJSON();
        const filled = renderer
            .create(
                <View style={{ flex: 1 }}>
                    <SideSafeAreaFill style={{ backgroundColor: 'black' }} />
                </View>,
            )
            .toJSON();
        expect(filled).toEqual(plain);
    });

    it('iPhone Duo: the styles reach the edges of the window and keep the content in the column', () => {
        const m = moduleWith(DUO);
        // 2000 on the left: the side that is free when the phone is open
        expect(m.sideBleedEdges).toEqual({ left: -2000, right: -84 });
        expect(m.sideBleedAbsolute).toEqual({
            left: -2000,
            right: -84,
            width: 2000 + 382 + 84,
            paddingLeft: 2000,
            paddingRight: 84,
        });
        expect(m.sideBleedMargin).toEqual({ marginLeft: -2000, marginRight: -84, paddingLeft: 2000, paddingRight: 84 });
    });

    it('iPhone Duo: the fill is a strip on each side of the element, in the style of the element', () => {
        const { SideSafeAreaFill } = moduleWith(DUO);
        const tree = renderer.create(<SideSafeAreaFill style={{ backgroundColor: 'black' }} />).toJSON() as any[];
        expect(tree).toHaveLength(2);
        expect(tree[0].props.style).toEqual({
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: -2000,
            width: 2000,
            backgroundColor: 'black',
        });
        expect(tree[1].props.style).toEqual({
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: -84,
            width: 84,
            backgroundColor: 'black',
        });
    });

    it('a larger safe area on the left: the free side is the right', () => {
        const m = moduleWith({
            sideInsets: 60,
            leftInset: 40,
            rightInset: 20,
            screen: { windowWidth: 500, uncorrectedWidth: 440 },
        });
        expect(m.sideBleedEdges).toEqual({ left: -40, right: -2020 });
    });
});

describe('iPhone Duo, open: the window is wider than the layout', () => {
    const INSETS = { left: 0, right: 84 };

    it('the free part is what is left beside the column and the safe area', () => {
        expect(freeWidthFor(466, INSETS, 382)).toBe(0);
        expect(freeWidthFor(951, INSETS, 382)).toBe(485);
        // never negative, and nothing without a known column
        expect(freeWidthFor(400, INSETS, 382)).toBe(0);
        expect(freeWidthFor(951, INSETS)).toBe(0);
        expect(freeWidthFor(951, INSETS, 0)).toBe(0);
        expect(freeWidthFor(NaN, INSETS, 382)).toBe(0);
    });

    describe('the screen is a column beside the safe area, and follows the window', () => {
        let listener: (() => void) | undefined;
        let windowWidth = 466;

        beforeEach(() => {
            listener = undefined;
            windowWidth = 466;
            jest.spyOn(Dimensions, 'get').mockImplementation(
                () => ({ width: windowWidth, height: 678, scale: 3, fontScale: 1 }) as any,
            );
            jest.spyOn(Dimensions, 'addEventListener').mockImplementation((_type: any, handler: any) => {
                listener = handler;
                return { remove: jest.fn() } as any;
            });
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        const styleOf = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(View)[0].props.style;

        it('closed: only the safe area', () => {
            const Wrapped = withSideInsets(Screen, INSETS, 382);
            const tree = renderer.create(<Wrapped label="a" />);
            expect(styleOf(tree)).toEqual({ flex: 1, marginLeft: 0, marginRight: 84 });
        });

        it('started open: the column is on the right, beside the tab bar', () => {
            windowWidth = 951;
            const Wrapped = withSideInsets(Screen, INSETS, 382);
            const tree = renderer.create(<Wrapped label="a" />);
            expect(styleOf(tree)).toEqual({ flex: 1, marginLeft: 485, marginRight: 84 });
        });

        it('opened and closed while the app runs: the column moves, the screen is not made again', () => {
            const Wrapped = withSideInsets(Screen, INSETS, 382);
            const tree = renderer.create(<Wrapped label="a" />);
            const screen = tree.root.findByType(Screen).instance;
            expect(typeof listener).toBe('function');

            windowWidth = 951;
            renderer.act(() => listener!());
            expect(styleOf(tree)).toEqual({ flex: 1, marginLeft: 485, marginRight: 84 });

            windowWidth = 466;
            renderer.act(() => listener!());
            expect(styleOf(tree)).toEqual({ flex: 1, marginLeft: 0, marginRight: 84 });

            expect(tree.root.findByType(Screen).instance).toBe(screen);
        });

        it('a safe area on the left: the free part goes to the right', () => {
            windowWidth = 951;
            const Wrapped = withSideInsets(Screen, { left: 84, right: 0 }, 382);
            const tree = renderer.create(<Wrapped label="a" />);
            expect(styleOf(tree)).toEqual({ flex: 1, marginLeft: 84, marginRight: 485 });
        });

        it('stops listening when the screen goes away', () => {
            const remove = jest.fn();
            (Dimensions.addEventListener as jest.Mock).mockReturnValue({ remove });
            const Wrapped = withSideInsets(Screen, INSETS, 382);
            const tree = renderer.create(<Wrapped label="a" />);
            tree.unmount();
            expect(remove).toHaveBeenCalledTimes(1);
        });
    });
});
