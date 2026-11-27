import React from 'react';
import renderer from 'react-test-renderer';
import { StyleSheet } from 'react-native';

import { AndroidWindowSurroundContext } from '@common/helpers/androidWindowContext';
import BlurView from '../BlurView';

jest.mock('react-native', () => ({
    View: 'ReactView',
    requireNativeComponent: () => 'NativeBlur',
    StyleSheet: { flatten: (styles: any) => Object.assign({}, ...(Array.isArray(styles) ? styles : [styles])) },
}));

const PinControls = () => {
    return React.createElement('PIN');
};

describe('bounded Android window blur', () => {
    const content = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const;
    const bleed = { left: -2000, width: 4337, height: 4841, paddingLeft: 2000 };

    it('keeps the existing native tree and styles when no Android surround is supplied', () => {
        const tree = renderer.create(
            <BlurView style={bleed} contentStyle={content} blurType="light" blurAmount={20}>
                <PinControls />
            </BlurView>,
        );
        const blur = tree.root.findByType('NativeBlur' as any);
        expect(blur.props.style).toBe(bleed);
        expect(blur.findByType(PinControls)).toBeDefined();
        expect(tree.root.findAllByType('ReactView' as any)).toHaveLength(0);
        tree.unmount();
    });

    it.each([
        ['cover', { left: 0, width: 337, height: 817, columnWidth: 337, scale: 1 }],
        ['inner', { left: 337, width: 674, height: 809, columnWidth: 337, scale: 1 }],
    ])('keeps PIN controls outside the native FrameLayout and bounds the %s blur bitmap', (name, surround) => {
        const tree = renderer.create(
            <AndroidWindowSurroundContext.Provider value={surround}>
                <BlurView style={bleed} contentStyle={content} blurType="light" blurAmount={20}>
                    <PinControls />
                </BlurView>
            </AndroidWindowSurroundContext.Provider>,
        );
        const blur = tree.root.findByType('NativeBlur' as any);
        expect(blur.children).toHaveLength(0);
        expect(blur.props.style).toEqual({
            position: 'absolute', left: surround.left === 0 ? 0 : -surround.left, top: 0,
            width: surround.width, height: surround.height,
        });
        expect(blur.props.blurAmount).toBe(20);
        const parent = tree.root.findByType('ReactView' as any);
        expect(parent.findByType(PinControls)).toBeDefined();
        expect(StyleSheet.flatten(parent.props.style)).toEqual({
            ...content, width: surround.columnWidth, height: surround.height,
        });
        expect(parent.props.style).not.toContain(bleed);
        tree.unmount();
    });

    it('samples exactly the visible window when the phone column is scaled', () => {
        const surround = { left: 180, width: 517, height: 760, columnWidth: 337, scale: 0.8 };
        const tree = renderer.create(
            <AndroidWindowSurroundContext.Provider value={surround}>
                <BlurView style={bleed}><PinControls /></BlurView>
            </AndroidWindowSurroundContext.Provider>,
        );
        const blur = tree.root.findByType('NativeBlur' as any);
        const { style } = blur.props;
        // Native measured dimensions are physical window dp, not window/scale.
        expect(style.width).toBeCloseTo(413.6);
        expect(style.height).toBe(608);
        expect(style.left).toBeCloseTo(-128.3);
        expect(style.top).toBeCloseTo(76);
        expect(style.transform).toEqual([{ scale: 1.25 }]);
        expect(blur.children).toHaveLength(0);
        const parent = tree.root.findByType('ReactView' as any);
        expect(StyleSheet.flatten(parent.props.style)).toEqual({ width: 337, height: 760 });
        expect(parent.findByType(PinControls)).toBeDefined();
        tree.unmount();
    });
});
