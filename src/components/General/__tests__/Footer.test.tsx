/**
 * @format
 */

import React from 'react';
// Note: test renderer must be required after react-native.
import renderer from 'react-test-renderer';
import { Platform } from 'react-native';

import { AndroidWindowSurroundContext } from '@common/helpers/androidWindowContext';
import { AppSizes } from '@theme';

import { Footer } from '..';

describe('[Footer]', () => {
    it('renders correctly', () => {
        const tree = renderer.create(<Footer>{}</Footer>).toJSON();
        expect(tree).toMatchSnapshot();
    });
});

describe('Android full-pane Footer', () => {
    const originalOS = Platform.OS;
    afterEach(() => { Platform.OS = originalOS; });

    it('fills the pane and restores the original width on the same mounted footer', () => {
        Platform.OS = 'android';
        const pane = { left: 0, width: 407, height: 387, columnWidth: 407, scale: 1, fullPane: true };
        const tree = renderer.create(
            <AndroidWindowSurroundContext.Provider value={pane}><Footer>{null}</Footer>
            </AndroidWindowSurroundContext.Provider>,
        );
        const footer = tree.root.findByType(Footer).instance;
        expect((tree.toJSON() as any).props.style.width).toBe('100%');
        tree.update(
            <AndroidWindowSurroundContext.Provider value={undefined}><Footer>{null}</Footer>
            </AndroidWindowSurroundContext.Provider>,
        );
        expect(tree.root.findByType(Footer).instance).toBe(footer);
        expect((tree.toJSON() as any).props.style.width).toBe(AppSizes.screen.width);
        tree.unmount();
    });
});
