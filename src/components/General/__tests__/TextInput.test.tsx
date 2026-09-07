/**
 * @format
 */

import React from 'react';
import { TextInput as RNTextInput } from 'react-native';
// Note: test renderer must be required after react-native.
import renderer from 'react-test-renderer';

import { TextInput } from '..';
import { noAutofillProps } from '../TextInput';

describe('[TextInput]', () => {
    it('renders correctly', () => {
        const tree = renderer.create(<TextInput />).toJSON();
        expect(tree).toMatchSnapshot();
    });

    it('disables postal-address autofill so iOS/Android never suggest a home address', () => {
        const tree = renderer.create(<TextInput placeholder="Please enter your address" />);
        const input = tree.root.findByType(RNTextInput);

        expect(input.props.autoComplete).toBe('off');
        expect(input.props.textContentType).toBe('none');
        expect(input.props.importantForAutofill).toBe('no');
        expect(input.props.autoCorrect).toBe(false);
        expect(input.props.spellCheck).toBe(false);
        expect(noAutofillProps.textContentType).toBe('none');
    });
});
