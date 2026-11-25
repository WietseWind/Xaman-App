/**
 * Shared controls tell screen readers what they are, what state they're in and what they do.
 */
import React from 'react';
import { AccessibilityInfo, Switch as RNSwitch, Text, TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import NetworkService from '@services/NetworkService';

import {
    AmountText,
    Button,
    CheckBox,
    Header,
    RadioButton,
    ScreenReaderAnnouncement,
    Switch,
    TouchableDebounce,
} from '..';

const touchable = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(TouchableOpacity);

describe('[accessibility] shared controls', () => {
    it('TouchableDebounce is a button unless the caller says otherwise', () => {
        const plain = renderer.create(<TouchableDebounce onPress={jest.fn()} />);
        expect(touchable(plain)[0].props.accessibilityRole).toBe('button');

        const link = renderer.create(<TouchableDebounce accessibilityRole="link" onPress={jest.fn()} />);
        expect(touchable(link)[0].props.accessibilityRole).toBe('link');
    });

    it('Button: an icon-only button is named after what the icon does; text buttons keep their text', () => {
        const back = renderer.create(<Button icon="IconChevronLeft" onPress={jest.fn()} />);
        expect(touchable(back)[0].props.accessibilityLabel).toBe('Back');

        const labelled = renderer.create(<Button icon="IconChevronLeft" label="Previous" onPress={jest.fn()} />);
        expect(touchable(labelled)[0].props.accessibilityLabel).toBeUndefined();

        const explicit = renderer.create(<Button icon="IconX" accessibilityLabel="Dismiss" onPress={jest.fn()} />);
        expect(touchable(explicit)[0].props.accessibilityLabel).toBe('Dismiss');
    });

    it('Button: says busy while loading and selected when selected', () => {
        const loading = renderer.create(<Button label="Send" isLoading onPress={jest.fn()} />);
        expect(touchable(loading)[0].props.accessibilityState).toMatchObject({ busy: true });

        const selected = renderer.create(<Button label="Tokens" isSelected onPress={jest.fn()} />);
        expect(touchable(selected)[0].props.accessibilityState).toMatchObject({ selected: true });
    });

    it('Header: the title is a heading, an icon button is named, a side without action is no button', () => {
        const tree = renderer.create(
            <Header
                leftComponent={{ icon: 'IconChevronLeft', onPress: jest.fn() }}
                centerComponent={{ text: 'Settings' }}
                rightComponent={{ text: 'Info' }}
            />,
        );
        const [left, center, right] = touchable(tree);

        expect(left.props.accessibilityRole).toBe('button');
        expect(left.props.accessibilityLabel).toBe('Back');
        expect(center.props.accessibilityRole).toBe('header');
        expect(center.props.accessibilityLabel).toBe('Settings');
        expect(right.props.accessibilityRole).toBe('none');
    });

    it('CheckBox and RadioButton report their state', () => {
        const checkbox = renderer.create(<CheckBox checked label="I agree" onPress={jest.fn()} />);
        expect(touchable(checkbox)[0].props.accessibilityRole).toBe('checkbox');
        expect(touchable(checkbox)[0].props.accessibilityState).toMatchObject({ checked: true });

        const radio = renderer.create(
            <RadioButton checked={false} disabled label="Passcode" value="p" onPress={jest.fn()} />,
        );
        expect(touchable(radio)[0].props.accessibilityRole).toBe('radio');
        expect(touchable(radio)[0].props.accessibilityState).toMatchObject({ checked: false, disabled: true });
    });

    it('Switch is named by its title when it has no label', () => {
        const tree = renderer.create(<Switch title="Developer mode" checked={false} onChange={jest.fn()} />);
        expect(tree.root.findByType(RNSwitch).props.accessibilityLabel).toBe('Developer mode');
    });
});

describe('[accessibility] AmountText', () => {
    beforeEach(() => {
        jest.spyOn(NetworkService, 'getNativeAsset').mockReturnValue('XRP');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    const valueText = (tree: renderer.ReactTestRenderer) =>
        tree.root.findAll((node) => node.type === Text && node.props.accessibilityLabel !== undefined)[0];

    it('reads the whole amount with its currency', () => {
        const tree = renderer.create(<AmountText value="1234.56789" currency="XRP" />);
        expect(valueText(tree).props.accessibilityLabel).toMatch(/^1,?234\.56789 XRP$/);
    });

    it('reads tiny amounts in full', () => {
        const tree = renderer.create(<AmountText value="0.000000012" currency="USD" />);
        expect(valueText(tree).props.accessibilityLabel).toBe('0.000000012 USD');
    });

    it('never reads a hidden amount', () => {
        const tree = renderer.create(<AmountText value="1234" currency="XRP" discreet />);
        const label = valueText(tree).props.accessibilityLabel;
        expect(label).toBe('Amount hidden');
        expect(label).not.toContain('1234');
    });
});

describe('[accessibility] ScreenReaderAnnouncement', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    it('says its message once the screen has settled, and renders nothing', () => {
        const announce = jest.mocked(AccessibilityInfo.announceForAccessibility);
        let tree: renderer.ReactTestRenderer;
        act(() => {
            tree = renderer.create(<ScreenReaderAnnouncement message="Transaction submitted" />);
        });

        expect(tree!.toJSON()).toBeNull();
        expect(announce).not.toHaveBeenCalled();

        act(() => {
            jest.advanceTimersByTime(500);
        });
        expect(announce).toHaveBeenCalledWith('Transaction submitted');
    });
});
