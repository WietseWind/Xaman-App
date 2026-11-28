/**
 * @format
 */

import React from 'react';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
// Note: test renderer must be required after react-native.
import renderer, { act } from 'react-test-renderer';

import { SecurePinInput } from '..';
import { SensitiveAccessibilityView } from '../SensitiveAccessibilityView';
import { Icon } from '../Icon';
import { AndroidWindowSurroundContext } from '@common/helpers/androidWindowContext';

describe('[SecurePinInput]', () => {
    it('renders correctly', () => {
        const onInputFinish = jest.fn();

        const tree = renderer.create(<SecurePinInput length={6} onInputFinish={onInputFinish} />).toJSON();
        expect(tree).toMatchSnapshot();
    });

    it('renders correctly with virtualKeyboard', () => {
        const onInputFinish = jest.fn();

        const tree = renderer
            .create(<SecurePinInput virtualKeyboard length={6} onInputFinish={onInputFinish} />)
            .toJSON();
        expect(tree).toMatchSnapshot();
    });

    it('should call onInputFinish when all pin is entered', () => {
        const onInputFinish = jest.fn();

        const instanceOf = renderer
            .create(<SecurePinInput virtualKeyboard length={6} onInputFinish={onInputFinish} />)
            .getInstance();

        for (let i = 1; i < 7; i++) {
            // @ts-ignore
            instanceOf.onInput('0'.repeat(i));
        }

        // @ts-ignore
        expect(instanceOf.state.digits).toBe('000000');
        expect(onInputFinish).toBeCalledTimes(1);
    });
});

describe('Android full-pane PIN layout', () => {
    const originalOS = Platform.OS;
    afterEach(() => { Platform.OS = originalOS; });

    const pane = { left: 0, width: 407, height: 387, columnWidth: 407, scale: 1, fullPane: true,
        topInset: 28 };
    const renderedStyle = (tree: renderer.ReactTestRenderer, testID: string) => {
        const node = tree.root.findAllByProps({ testID }).find((item) => Array.isArray(item.props.style));
        return StyleSheet.flatten(node?.props.style);
    };

    it.each([[232, 44], [248, 48]])('fits the measured %idp slot with %idp keys', (height, keyHeight) => {
        Platform.OS = 'android';
        const props = { virtualKeyboard: true, supportBiometric: true, length: 6,
            onInputFinish: jest.fn(), paneLayout: { width: 367, height } };
        const tree = renderer.create(
            <AndroidWindowSurroundContext.Provider value={pane}>
                {React.createElement(SecurePinInput, props as any)}
            </AndroidWindowSurroundContext.Provider>,
        );
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'y', '0', 'x'].forEach((key) => {
            expect(renderedStyle(tree, `${key}-key`)).toMatchObject({ height: keyHeight, minWidth: 44 });
        });
        expect(renderedStyle(tree, 'virtual-keyboard')).toMatchObject({ width: '100%', marginTop: 8 });
        expect(32 + 8 + 4 * (keyHeight + 4)).toBeLessThanOrEqual(height);
        const deleteIcon = tree.root.findAllByProps({ testID: 'x-key' })[0].findByType(Icon);
        const iconStyle = StyleSheet.flatten(deleteIcon.props.style);
        const iconTop = (keyHeight - deleteIcon.props.size + Number(iconStyle.marginTop)) / 2;
        expect(iconTop).toBeGreaterThanOrEqual(0);
        expect(iconTop + deleteIcon.props.size).toBeLessThanOrEqual(keyHeight);
        expect(iconStyle.marginTop).toBe(0);
        tree.unmount();
    });

    it('keeps the same PIN input, key instances and entered digits across pane resizing', () => {
        Platform.OS = 'android';
        const onInputFinish = jest.fn();
        const render = (fullPane: boolean, height: number) => (
            <AndroidWindowSurroundContext.Provider value={fullPane ? pane : undefined}>
                {React.createElement(SecurePinInput, { virtualKeyboard: true, length: 6, onInputFinish,
                    paneLayout: { width: 367, height } } as any)}
            </AndroidWindowSurroundContext.Provider>
        );
        const tree = renderer.create(render(false, 248));
        const input = tree.root.findByType(SecurePinInput).instance;
        const key = tree.root.findAllByProps({ testID: '1-key' })[0];
        act(() => { input.onInput('1'); });
        act(() => { input.onInput('2'); });
        tree.update(render(true, 232));
        expect(tree.root.findByType(SecurePinInput).instance).toBe(input);
        expect(tree.root.findAllByProps({ testID: '1-key' })[0]).toBe(key);
        expect(input.state.digits).toBe('12');
        expect(renderedStyle(tree, '1-key').height).toBe(44);
        tree.update(render(true, 248));
        expect(input.state.digits).toBe('12');
        expect(renderedStyle(tree, '1-key').height).toBe(48);
        tree.update(render(false, 248));
        expect(tree.root.findByType(SecurePinInput).instance).toBe(input);
        expect(input.state.digits).toBe('12');
        expect(onInputFinish).not.toHaveBeenCalled();
        tree.unmount();
    });
});

describe('[SecurePinInput] for screen readers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const dotsOf = (tree: renderer.ReactTestRenderer) =>
        tree.root.find((node) => typeof node.type === 'string' && node.props.accessibilityValue?.text !== undefined);

    it('says how many digits are entered, never which', () => {
        const announce = jest.mocked(AccessibilityInfo.announceForAccessibility);
        const tree = renderer.create(<SecurePinInput virtualKeyboard length={6} onInputFinish={jest.fn()} />);
        const pad = tree.getInstance() as unknown as SecurePinInput;

        act(() => {
            pad.onInput('7');
        });
        act(() => {
            pad.onInput('3');
        });
        act(() => {
            pad.onInput('Backspace');
        });

        expect(announce.mock.calls.map((call) => call[0])).toEqual([
            '1 of 6 digits entered',
            '2 of 6 digits entered',
            '1 of 6 digits entered',
        ]);
        expect(dotsOf(tree).props.accessibilityValue).toEqual({ text: '1 of 6 digits entered' });
    });

    it('announces nothing for the last digit: the screen reports the result', () => {
        const announce = jest.mocked(AccessibilityInfo.announceForAccessibility);
        const onInputFinish = jest.fn();
        const tree = renderer.create(<SecurePinInput virtualKeyboard length={6} onInputFinish={onInputFinish} />);
        const pad = tree.getInstance() as unknown as SecurePinInput;

        '123456'.split('').forEach((digit) => {
            act(() => {
                pad.onInput(digit);
            });
        });

        expect(onInputFinish).toHaveBeenCalledWith('123456');
        expect(announce).toHaveBeenCalledTimes(5);
        expect(announce).not.toHaveBeenCalledWith('6 of 6 digits entered');
    });

    it('names the delete and biometrics keys in the app language and the dots as the passcode', () => {
        const tree = renderer.create(
            <SecurePinInput virtualKeyboard supportBiometric length={6} onInputFinish={jest.fn()} />,
        );

        const key = (testID: string) =>
            tree.root.find(
                (node) =>
                    typeof node.type === 'string' &&
                    node.props.testID === testID &&
                    node.props.accessibilityLabel !== undefined,
            );
        expect(key('x-key').props.accessibilityLabel).toBe('Delete');
        expect(key('y-key').props.accessibilityLabel).toBe('Biometric authentication');
        expect(key('y-key').props.accessibilityRole).toBe('button');
        expect(key('5-key').props.accessibilityLabel).toBe('5');

        const dots = dotsOf(tree);
        expect(dots.props.accessibilityLabel).toBe('Passcode');
        expect(dots.props.accessibilityHint).toBe('Please enter your passcode');
        expect(dots.props.accessibilityValue).toEqual({ text: '0 of 6 digits entered' });
    });

    it('takes another name for other digits (secret numbers)', () => {
        const tree = renderer.create(
            <SecurePinInput
                virtualKeyboard
                length={6}
                onInputFinish={jest.fn()}
                accessibilityLabel="Secret numbers of row B"
                accessibilityHint=""
            />,
        );

        const dots = dotsOf(tree);
        expect(dots.props.accessibilityLabel).toBe('Secret numbers of row B');
        expect(dots.props.accessibilityHint).toBe('');
    });

    it('keeps the whole pad inside the sensitive view', () => {
        const tree = renderer.create(<SecurePinInput virtualKeyboard length={6} onInputFinish={jest.fn()} />);

        const sensitive = tree.root.findByType(SensitiveAccessibilityView);
        expect(sensitive.findAll((node) => node.props.testID === 'virtual-keyboard').length).toBeGreaterThan(0);
        expect(sensitive.findAll((node) => node.props.testID === '1-key').length).toBeGreaterThan(0);
    });

    it('announces a clear after a long press on delete', () => {
        const announce = jest.mocked(AccessibilityInfo.announceForAccessibility);
        const tree = renderer.create(<SecurePinInput virtualKeyboard length={6} onInputFinish={jest.fn()} />);
        const pad = tree.getInstance() as unknown as SecurePinInput;

        act(() => {
            pad.onInput('1');
        });
        act(() => {
            pad.clearAllInput();
        });

        expect(announce).toHaveBeenLastCalledWith('0 of 6 digits entered');
        expect(dotsOf(tree).props.accessibilityValue).toEqual({ text: '0 of 6 digits entered' });
    });
});
