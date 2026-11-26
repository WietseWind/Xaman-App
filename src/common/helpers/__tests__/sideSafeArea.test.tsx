/* eslint-disable react-native/no-inline-styles, react-native/no-color-literals */
/**
 * Screens and a safe area on a side of the screen (issue 544, iPhone Duo).
 * Without such an area a screen is registered as it is: the same class, nothing around it.
 */
import React, { Component } from 'react';
import { Dimensions, Platform, Text, View } from 'react-native';
import renderer from 'react-test-renderer';

import { columnStyleFor, sideMarginsFor, SideSafeAreaContext, withSideInsets } from '../sideSafeArea';

class Screen extends Component<{ label: string }> {
    static screenName = 'app.Test';

    static options() {
        return { topBar: { visible: false } };
    }

    static get live() {
        return Screen.screenName;
    }

    static defaultProps = { label: 'default label' };

    static getDerivedStateFromError() {
        return null;
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
    screen: { windowWidth: number; uncorrectedWidth: number; height: number };
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
    screen: { windowWidth: 390, uncorrectedWidth: 390, height: 844 },
};
const DUO: Sizes = {
    sideInsets: 84,
    leftInset: 0,
    rightInset: 84,
    screen: { windowWidth: 466, uncorrectedWidth: 382, height: 678 },
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

// the view that holds the screen in its column
const columnOf = (tree: renderer.ReactTestRenderer) =>
    tree.root.findAll((node) => node.type === View && node.props.style?.marginRight !== undefined)[0];
const marginsOf = (tree: renderer.ReactTestRenderer) => {
    const { marginLeft, marginRight } = columnOf(tree).props.style;
    return { marginLeft, marginRight };
};
// the native view that tells the live values
const nativeOf = (tree: renderer.ReactTestRenderer) =>
    tree.root.findAll((node) => typeof node.props.onSideSafeAreaChange === 'function')[0];

describe('a safe area on a side: iPhone Duo', () => {
    const originalOS = Platform.OS;

    beforeEach(() => {
        Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'ios' });
        jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 466, height: 678, scale: 3, fontScale: 1 } as any);
    });

    afterEach(() => {
        Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOS });
        jest.restoreAllMocks();
    });

    it('keeps the screen out of it, and passes the props on', () => {
        const Wrapped = withSideInsets(Screen, { left: 0, right: 84 });
        const tree = renderer.create(<Wrapped label="hello" />);
        expect(marginsOf(tree)).toEqual({ marginLeft: 0, marginRight: 84 });
        expect(columnOf(tree).props.pointerEvents).toBe('box-none');
        expect(nativeOf(tree).props.pointerEvents).toBe('box-none');
        expect(tree.root.findByType(Screen).props).toEqual({ label: 'hello' });
        expect(tree.root.findByType(Text).props.children).toBe('hello');
    });

    it('takes both sides, and no negative side', () => {
        const Both = withSideInsets(Screen, { left: 40, right: -3 });
        expect(marginsOf(renderer.create(<Both label="x" />))).toEqual({ marginLeft: 40, marginRight: 0 });
    });

    it('has the statics of the screen: the navigation library reads them', () => {
        const W = withSideInsets(Screen, { left: 0, right: 84 }) as any;
        expect(W).not.toBe(Screen);
        expect(W.screenName).toBe('app.Test');
        expect(W.options()).toEqual({ topBar: { visible: false } });
        expect(W.live).toBe('app.Test');
        expect(W.displayName).toBe('SideSafeArea(Screen)');
        expect(W.prototype).not.toBe(Screen.prototype);
    });

    it('leaves what React reads from the class with the screen: no error boundary, default props still work', () => {
        const W = withSideInsets(Screen, { left: 0, right: 84 }) as any;
        expect(W.getDerivedStateFromError).toBeUndefined();
        expect(W.defaultProps).toBeUndefined();
        const tree = renderer.create(<W />);
        expect(tree.root.findByType(Text).props.children).toBe('default label');
    });

    it('the app makes one wrapper for a screen, however often it is asked for', () => {
        const withSideSafeArea = withAppSizes(DUO);
        const first = withSideSafeArea(Screen);
        expect(first).not.toBe(Screen);
        expect(withSideSafeArea(Screen)).toBe(first);
        expect(first.displayName).toBe('SideSafeArea(Screen)');
        expect(first.screenName).toBe('app.Test');
    });

    it('without the native view (not iOS): the column from the start values, no native view', () => {
        Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
        const Wrapped = withSideInsets(Screen, { left: 0, right: 84 });
        const tree = renderer.create(<Wrapped label="a" />);
        expect(marginsOf(tree)).toEqual({ marginLeft: 0, marginRight: 84 });
        expect(nativeOf(tree)).toBeUndefined();
    });
});

describe('the place of the column, from what the native view tells', () => {
    const START = { left: 0, right: 84 };
    const at = (left: number, right: number, width: number, edge: number) => ({ left, right, width, edge });

    it('closed: the safe area on the right, nothing free', () => {
        expect(sideMarginsFor(at(0, 84, 466, 2), START, 382)).toEqual({ marginLeft: 0, marginRight: 84 });
    });

    it('open: the column beside the bar on the right, the free half on the left', () => {
        expect(sideMarginsFor(at(0, 84, 951, 2), START, 382)).toEqual({ marginLeft: 485, marginRight: 84 });
    });

    it('in the left half: the bar is on the left, and so is its space', () => {
        expect(sideMarginsFor(at(84, 0, 469, 1), START, 382)).toEqual({ marginLeft: 84, marginRight: 3 });
    });

    it('in the right half: the bar is on the right, and so is its space', () => {
        expect(sideMarginsFor(at(0, 84, 469, 2), START, 382)).toEqual({ marginLeft: 3, marginRight: 84 });
    });

    it('an overlay or a modal in the left half has no safe area of its own: the column of the bar stays free', () => {
        expect(sideMarginsFor(at(0, 0, 469, 1), START, 382)).toEqual({ marginLeft: 84, marginRight: 3 });
        expect(sideMarginsFor(at(0, 0, 469, 2), START, 382)).toEqual({ marginLeft: 3, marginRight: 84 });
    });

    it('the edge is not known: the side with the larger safe area, else the side the app started with', () => {
        expect(sideMarginsFor(at(84, 0, 469, 0), START, 382)).toEqual({ marginLeft: 84, marginRight: 3 });
        expect(sideMarginsFor(at(0, 0, 469, 0), START, 382)).toEqual({ marginLeft: 3, marginRight: 84 });
        const startedLeft = { left: 84, right: 0 };
        expect(sideMarginsFor(at(0, 0, 469, 0), startedLeft, 382)).toEqual({ marginLeft: 84, marginRight: 3 });
    });

    it('right to left: the leading edge is the right', () => {
        expect(sideMarginsFor(at(0, 0, 469, 1), START, 382, true)).toEqual({ marginLeft: 3, marginRight: 84 });
        expect(sideMarginsFor(at(0, 0, 469, 2), START, 382, true)).toEqual({ marginLeft: 84, marginRight: 3 });
    });

    it('never a negative margin, and nothing free without a known column', () => {
        expect(sideMarginsFor(at(0, 84, 400, 2), START, 382)).toEqual({ marginLeft: 0, marginRight: 84 });
        expect(sideMarginsFor(at(0, 84, 951, 2), START)).toEqual({ marginLeft: 0, marginRight: 84 });
        expect(sideMarginsFor(at(-5, NaN, 951, 2), START, 382)).toEqual({ marginLeft: 485, marginRight: 84 });
        expect(sideMarginsFor(at(0, 100, 466, 2), START, 382)).toEqual({ marginLeft: 0, marginRight: 100 });
    });
});

describe('the open phone turned a quarter: no bar on a side, the window is higher than the layout', () => {
    const START = { left: 0, right: 84 };

    it('the column is in the middle', () => {
        expect(sideMarginsFor({ left: 0, right: 0, width: 669, edge: 0 }, START, 382)).toEqual({
            marginLeft: 143.5,
            marginRight: 143.5,
        });
    });

    it('the box has the height of the layout and is in the middle of the window', () => {
        const now = { left: 0, right: 0, width: 669, height: 951, edge: 0 };
        expect(columnStyleFor(now, START, { width: 382, height: 678 })).toEqual({
            marginLeft: 143.5,
            marginRight: 143.5,
            height: 678,
            marginTop: 136.5,
        });
    });

    it('closed, open and in one half the window is about as high as the layout: the whole height', () => {
        [
            { left: 0, right: 84, width: 466, height: 678, edge: 2 },
            { left: 0, right: 84, width: 951, height: 669, edge: 2 },
            { left: 84, right: 0, width: 469, height: 669, edge: 1 },
            // started open (layout 669 high), then closed (678)
            { left: 0, right: 84, width: 466, height: 678, edge: 2 },
        ].forEach((now) => {
            expect(columnStyleFor(now, START, { width: 382, height: 669 }).flex).toBe(1);
            expect(columnStyleFor(now, START, { width: 382, height: 678 }).height).toBeUndefined();
        });
    });

    it('no height known: the whole height', () => {
        expect(columnStyleFor({ left: 0, right: 84, width: 466, edge: 2 }, START, { width: 382 })).toEqual({
            marginLeft: 0,
            marginRight: 84,
            flex: 1,
        });
    });
});

describe('the screen follows the phone while the app runs', () => {
    const originalOS = Platform.OS;
    let windowWidth = 466;
    let windowHeight = 678;

    beforeEach(() => {
        windowWidth = 466;
        windowHeight = 678;
        Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'ios' });
        jest.spyOn(Dimensions, 'get').mockImplementation(
            () => ({ width: windowWidth, height: windowHeight, scale: 3, fontScale: 1 }) as any,
        );
    });

    afterEach(() => {
        Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOS });
        jest.restoreAllMocks();
    });

    const tell = (
        tree: renderer.ReactTestRenderer,
        left: number,
        right: number,
        width: number,
        edge: number,
        height = 669,
    ) =>
        renderer.act(() =>
            nativeOf(tree).props.onSideSafeAreaChange({ nativeEvent: { left, right, width, height, edge } }),
        );
    const LAYOUT = { width: 382, height: 678 };

    it('started open: the column is on the right before the native view tells', () => {
        windowWidth = 951;
        const Wrapped = withSideInsets(Screen, { left: 0, right: 84 }, 382, 2);
        expect(marginsOf(renderer.create(<Wrapped label="a" />))).toEqual({ marginLeft: 485, marginRight: 84 });
    });

    it('closed, open, left half, right half, closed: the column moves, the screen is not made again', () => {
        const Wrapped = withSideInsets(Screen, { left: 0, right: 84 }, 382, 2);
        const tree = renderer.create(<Wrapped label="a" />);
        const screen = tree.root.findByType(Screen).instance;
        expect(marginsOf(tree)).toEqual({ marginLeft: 0, marginRight: 84 });

        tell(tree, 0, 84, 951, 2);
        expect(marginsOf(tree)).toEqual({ marginLeft: 485, marginRight: 84 });

        tell(tree, 84, 0, 469, 1);
        expect(marginsOf(tree)).toEqual({ marginLeft: 84, marginRight: 3 });

        tell(tree, 0, 84, 469, 2);
        expect(marginsOf(tree)).toEqual({ marginLeft: 3, marginRight: 84 });

        tell(tree, 0, 84, 466, 2);
        expect(marginsOf(tree)).toEqual({ marginLeft: 0, marginRight: 84 });

        expect(tree.root.findByType(Screen).instance).toBe(screen);
    });

    it('turned a quarter and back: a box of the layout in the middle of the window, then the column again', () => {
        const Wrapped = withSideInsets(Screen, { left: 0, right: 84 }, LAYOUT, 2);
        const tree = renderer.create(<Wrapped label="a" />);
        const screen = tree.root.findByType(Screen).instance;
        expect(columnOf(tree).props.style).toEqual({ marginLeft: 0, marginRight: 84, flex: 1 });

        tell(tree, 0, 0, 669, 0, 951);
        expect(columnOf(tree).props.style).toEqual({
            marginLeft: 143.5,
            marginRight: 143.5,
            height: 678,
            marginTop: 136.5,
        });

        tell(tree, 0, 84, 951, 2, 669);
        expect(columnOf(tree).props.style).toEqual({ marginLeft: 485, marginRight: 84, flex: 1 });

        expect(tree.root.findByType(Screen).instance).toBe(screen);
    });

    it('started turned a quarter: the box is in the middle before the native view tells', () => {
        windowWidth = 669;
        windowHeight = 951;
        const Wrapped = withSideInsets(Screen, { left: 0, right: 84 }, LAYOUT, 0);
        const tree = renderer.create(<Wrapped label="a" />);
        expect(columnOf(tree).props.style).toEqual({
            marginLeft: 143.5,
            marginRight: 143.5,
            height: 678,
            marginTop: 136.5,
        });
    });

    it('tells a panel how much window is below the box: only when the phone is turned a quarter', () => {
        const seen: number[] = [];
        class Sheet extends Component {
            static contextType = SideSafeAreaContext;

            render() {
                seen.push((this.context as { below: number }).below);
                return null;
            }
        }
        const Wrapped = withSideInsets(Sheet, { left: 0, right: 84 }, LAYOUT, 2);
        const tree = renderer.create(<Wrapped />);
        expect(seen[seen.length - 1]).toBe(0);

        tell(tree, 0, 0, 669, 0, 951);
        expect(seen[seen.length - 1]).toBe(136.5);

        tell(tree, 0, 84, 951, 2, 669);
        expect(seen[seen.length - 1]).toBe(0);

        tell(tree, 84, 0, 469, 1, 669);
        expect(seen[seen.length - 1]).toBe(0);
    });

    it('without the wrapper (every other phone) a panel reads 0', () => {
        let below = -1;
        const Probe = () => (
            <SideSafeAreaContext.Consumer>
                {(value) => {
                    below = value.below;
                    return null;
                }}
            </SideSafeAreaContext.Consumer>
        );
        renderer.create(<Probe />);
        expect(below).toBe(0);
    });

    it('takes no value from an event without a width', () => {
        const Wrapped = withSideInsets(Screen, { left: 0, right: 84 }, 382, 2);
        const tree = renderer.create(<Wrapped label="a" />);
        renderer.act(() => nativeOf(tree).props.onSideSafeAreaChange({ nativeEvent: { left: 84, right: 0 } }));
        renderer.act(() => nativeOf(tree).props.onSideSafeAreaChange({}));
        expect(marginsOf(tree)).toEqual({ marginLeft: 0, marginRight: 84 });
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

    it('iPhone Duo: the styles reach past all edges of the window and keep the content in the box', () => {
        const m = moduleWith(DUO);
        // 2000 on each side: more than any window is wide or high (the column can be on either side, and a box in
        // the middle when the open phone is turned a quarter)
        expect(m.sideBleedEdges).toEqual({ left: -2000, right: -2000, top: -2000, bottom: -2000 });
        expect(m.sideBleedAbsolute).toEqual({
            left: -2000,
            right: -2000,
            top: -2000,
            bottom: -2000,
            width: 2000 + 382 + 2000,
            height: 2000 + 678 + 2000,
            paddingLeft: 2000,
            paddingRight: 2000,
            paddingTop: 2000,
            paddingBottom: 2000,
        });
        expect(m.sideBleedMargin).toEqual({
            marginLeft: -2000,
            marginRight: -2000,
            marginTop: -2000,
            marginBottom: -2000,
            paddingLeft: 2000,
            paddingRight: 2000,
            paddingTop: 2000,
            paddingBottom: 2000,
        });
    });

    it('iPhone Duo: the fill is a strip on each side of the element, in the style of the element', () => {
        const { SideSafeAreaFill } = moduleWith(DUO);
        const tree = renderer.create(<SideSafeAreaFill style={{ backgroundColor: 'black' }} />).toJSON() as any[];
        expect(tree).toHaveLength(4);
        const styles = tree.map((node) => Object.assign({}, ...[].concat(node.props.style)));
        expect(styles).toEqual([
            { position: 'absolute', top: -2000, bottom: -2000, left: -2000, width: 2000, backgroundColor: 'black' },
            { position: 'absolute', top: -2000, bottom: -2000, right: -2000, width: 2000, backgroundColor: 'black' },
            { position: 'absolute', left: 0, right: 0, top: -2000, height: 2000, backgroundColor: 'black' },
            { position: 'absolute', left: 0, right: 0, bottom: -2000, height: 2000, backgroundColor: 'black' },
        ]);
    });
});
