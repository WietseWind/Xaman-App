/**
 * @format
 */

import React from 'react';
import renderer from 'react-test-renderer';
import { Platform, StyleSheet } from 'react-native';

import { AndroidWindowSurroundContext } from '@common/helpers/androidWindowContext';
import { AppSizes } from '@theme';

import { Header } from '../Header';

describe('[Header]', () => {
    it('renders correctly with default props', () => {
        const tree = renderer.create(<Header />).toJSON();
        expect(tree).toMatchSnapshot();
    });

    it('renders correctly with leftComponent', () => {
        const leftComponent = {
            text: 'Left',
        };
        const tree = renderer.create(<Header leftComponent={leftComponent} />).toJSON();
        expect(tree).toMatchSnapshot();
    });

    it('renders correctly with centerComponent', () => {
        const centerComponent = {
            text: 'Center',
        };
        const tree = renderer.create(<Header centerComponent={centerComponent} />).toJSON();
        expect(tree).toMatchSnapshot();
    });

    it('renders correctly with rightComponent', () => {
        const rightComponent = {
            text: 'Right',
        };
        const tree = renderer.create(<Header rightComponent={rightComponent} />).toJSON();
        expect(tree).toMatchSnapshot();
    });

    it('renders correctly with all components', () => {
        const leftComponent = {
            text: 'Left',
        };
        const centerComponent = {
            text: 'Center',
        };
        const rightComponent = {
            text: 'Right',
        };
        const tree = renderer
            .create(
                <Header
                    leftComponent={leftComponent}
                    centerComponent={centerComponent}
                    rightComponent={rightComponent}
                />,
            )
            .toJSON();
        expect(tree).toMatchSnapshot();
    });

    it('renders correctly with backgroundColor', () => {
        const tree = renderer.create(<Header backgroundColor="red" />).toJSON();
        expect(tree).toMatchSnapshot();
    });

    it('renders correctly with containerStyle', () => {
        // eslint-disable-next-line react-native/no-color-literals,react-native/no-inline-styles
        const tree = renderer.create(<Header containerStyle={{ borderWidth: 1, borderColor: 'blue' }} />).toJSON();
        expect(tree).toMatchSnapshot();
    });
});

describe('Android full-pane Header', () => {
    const originalOS = Platform.OS;
    afterEach(() => { Platform.OS = originalOS; });

    it('uses a 56dp header and the current pane inset without changing the mounted header', () => {
        Platform.OS = 'android';
        const pane = { left: 0, width: 407, height: 387, columnWidth: 407, scale: 1, fullPane: true,
            topInset: 24 };
        const tree = renderer.create(
            <AndroidWindowSurroundContext.Provider value={pane}><Header /></AndroidWindowSurroundContext.Provider>,
        );
        const header = tree.root.findByType(Header).instance;
        expect(StyleSheet.flatten((tree.toJSON() as any).props.style)).toMatchObject({ height: 56, marginTop: 24 });
        tree.update(
            <AndroidWindowSurroundContext.Provider value={{ ...pane, topInset: 52 }}>
                <Header />
            </AndroidWindowSurroundContext.Provider>,
        );
        expect(tree.root.findByType(Header).instance).toBe(header);
        expect(StyleSheet.flatten((tree.toJSON() as any).props.style)).toMatchObject({ height: 56, marginTop: 52 });
        tree.unmount();
    });

    it.each(['android', 'ios'])('retains the original %s header style outside an actual pane', (os) => {
        Platform.OS = os as typeof Platform.OS;
        const tree = renderer.create(<Header />);
        const { style } = (tree.toJSON() as any).props;
        expect(style).toHaveLength(4);
        expect(StyleSheet.flatten(style)).toMatchObject({ height: Header.Height, marginTop: AppSizes.statusBarHeight });
        tree.unmount();
    });
});
