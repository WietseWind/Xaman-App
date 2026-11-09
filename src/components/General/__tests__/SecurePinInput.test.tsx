/**
 * @format
 */

import React from 'react';
import { AccessibilityInfo } from 'react-native';
// Note: test renderer must be required after react-native.
import renderer, { act } from 'react-test-renderer';

import { SecurePinInput } from '..';
import { SensitiveAccessibilityView } from '../SensitiveAccessibilityView';

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
