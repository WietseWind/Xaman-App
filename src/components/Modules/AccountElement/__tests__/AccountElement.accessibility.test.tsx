/**
 * The address reads as "starting with … ending with …" and can be spelled out. Those props sit on a View:
 * the iOS native Text view has no onAccessibilityAction setter, and React Native then drops the whole UI
 * update (the review screen of build 474 stayed blank).
 */
import React from 'react';
import { Text, View } from 'react-native';
import renderer from 'react-test-renderer';

import AccountElement from '../AccountElement';

const ADDRESS = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY';
const VIEW_ONLY_PROPS = ['onAccessibilityAction', 'onAccessibilityEscape', 'onAccessibilityTap', 'onMagicTap'];

describe('[accessibility] AccountElement address', () => {
    const render = () =>
        renderer.create(
            <AccountElement
                address={ADDRESS}
                info={{ address: ADDRESS, name: 'Pepper', source: 'internal:accounts' }}
                visibleElements={{ avatar: false }}
            />,
        );

    it('puts the address label and the spell-out action on a View', () => {
        const tree = render();
        const holder = tree.root.findAll(
            (node) => node.type === View && node.props.onAccessibilityAction !== undefined,
        );

        expect(holder).toHaveLength(1);
        expect(holder[0].props.accessible).toBe(true);
        expect(holder[0].props.accessibilityLabel).toBe('Address starting with r P E P P, ending with 6 G D Y');
        expect(holder[0].props.accessibilityActions).toEqual([
            { name: 'spellOut', label: 'Spell out the full address' },
        ]);
        expect(holder[0].findByType(Text).props.children).toBe(ADDRESS);
    });

    it('never gives a Text a View-only accessibility event', () => {
        const tree = render();

        tree.root.findAllByType(Text).forEach((text) => {
            VIEW_ONLY_PROPS.forEach((prop) => expect(text.props[prop]).toBeUndefined());
        });
    });
});
