/**
 * Secret numbers for screen reader users: one element per row, read digit by digit, always inside
 * the sensitive view (on Android 14+ only accessibility tools such as TalkBack can read it).
 */
import React from 'react';
import renderer from 'react-test-renderer';

import { SecurePinInput } from '@components/General';
import { SensitiveAccessibilityView } from '@components/General/SensitiveAccessibilityView';

import SecretNumberInput from '../SecretNumberInput';
import SecretNumberRow from '../SecretNumberRow';

jest.mock('@store/repositories', () => ({
    CoreRepository: { getSettings: jest.fn(() => ({ hapticFeedback: false })) },
}));

const SECRET = ['482917', '000000', '111111', '222222', '333333', '444444', '555555', '666666'];

describe('[SecretNumberInput] for screen readers', () => {
    it('reads the shown row as one element, digit by digit', () => {
        const tree = renderer.create(<SecretNumberInput secretNumbers={SECRET} currentRow={0} readonly />);

        const rows = tree.root.findAll(
            (node) => typeof node.type === 'string' && node.props.accessibilityValue?.text !== undefined,
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].props.accessible).toBe(true);
        expect(rows[0].props.accessibilityLabel).toBe('Secret numbers of row A');
        expect(rows[0].props.accessibilityValue).toEqual({ text: '4 8 2 9 1 7' });
    });

    it('keeps the secret inside the sensitive view', () => {
        const tree = renderer.create(<SecretNumberInput secretNumbers={SECRET} currentRow={2} readonly />);

        const sensitive = tree.root.findByType(SensitiveAccessibilityView);
        expect(sensitive.findAllByType(SecretNumberRow)).toHaveLength(8);

        const labelled = tree.root.findAll(
            (node) => typeof node.props.accessibilityValue?.text === 'string' && node.props.accessible,
        );
        labelled.forEach((node) => {
            let { parent } = node;
            let inside = false;
            while (parent) {
                if (parent.type === SensitiveAccessibilityView) inside = true;
                parent = parent.parent;
            }
            expect(inside).toBe(true);
        });
    });

    it('names the pin pad after the row being entered, not the passcode', () => {
        const tree = renderer.create(<SecretNumberInput currentRow={3} />);

        const pad = tree.root.findByType(SecurePinInput);
        expect(pad.props.accessibilityLabel).toBe('Secret numbers of row D');
        expect(pad.props.accessibilityHint).toBe('');
    });
});
