import React from 'react';
import { TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { AmountInput, AmountValueType } from '../AmountInput';
import { AmountInputEditingContext } from '../AmountInput/EditingContext';

it('does not turn a password-manager username into an amount, even with focus', () => {
    const onChange = jest.fn();
    const tree = renderer.create(<AmountInput value="0" onChange={onChange} />);
    const input = tree.root.findByType(TextInput);
    act(() => input.props.onFocus());
    act(() => input.props.onChangeText('test123'));
    expect(onChange).not.toHaveBeenCalled();
    expect(input.props.value).toBe('0');
});

it('ignores numeric autofill before focus and after blur', () => {
    const onChange = jest.fn();
    const tree = renderer.create(<AmountInput value="0" onChange={onChange} />);
    const input = tree.root.findByType(TextInput);
    act(() => input.props.onChangeText('123'));
    act(() => input.props.onFocus());
    act(() => input.props.onBlur());
    act(() => input.props.onChangeText('456'));
    expect(onChange).not.toHaveBeenCalled();
    expect(input.props.value).toBe('0');
});

it('checks the signing lock before a delayed React render and requires focus again after unlock', () => {
    let editable = true;
    const onChange = jest.fn();
    const canEdit = () => editable;
    const tree = renderer.create(
        <AmountInputEditingContext.Provider value={canEdit}>
            <AmountInput value="0" onChange={onChange} />
        </AmountInputEditingContext.Provider>,
    );
    const input = tree.root.findByType(TextInput);
    act(() => input.props.onFocus());
    editable = false;
    // Native props can still be stale while the password overlay opens.
    expect(input.props.editable).toBe(true);
    act(() => input.props.onChangeText('123'));
    expect(onChange).not.toHaveBeenCalled();
    editable = true;
    act(() => input.props.onChangeText('456'));
    expect(onChange).not.toHaveBeenCalled();
    act(() => input.props.onFocus());
    act(() => input.props.onChangeText('2.5'));
    expect(onChange).toHaveBeenCalledWith('2.5');
});

it('disables the native input and ignores forced changes while the review is locked', () => {
    const onChange = jest.fn();
    const tree = renderer.create(
        <AmountInputEditingContext.Provider value={() => false}>
            <AmountInput value="0" onChange={onChange} />
        </AmountInputEditingContext.Provider>,
    );
    const input = tree.root.findByType(TextInput);
    expect(input.props.editable).toBe(false);
    act(() => input.props.onFocus());
    act(() => input.props.onChangeText('123'));
    expect(onChange).not.toHaveBeenCalled();
});

it('keeps read-only amounts unchanged, even if native events are forced', () => {
    const onChange = jest.fn();
    const tree = renderer.create(<AmountInput value="10" editable={false} onChange={onChange} />);
    const input = tree.root.findByType(TextInput);
    act(() => input.props.onFocus());
    act(() => input.props.onChangeText('123'));
    expect(onChange).not.toHaveBeenCalled();
    expect(input.props.value).toBe('10');
});

it('ignores late input events after leaving an amount-entry step', () => {
    const onChange = jest.fn();
    const tree = renderer.create(<AmountInput value="0" onChange={onChange} />);
    const input = tree.root.findByType(TextInput);
    act(() => input.props.onFocus());
    const lateChange = input.props.onChangeText;
    act(() => tree.unmount());
    act(() => lateChange('123'));
    expect(onChange).not.toHaveBeenCalled();
});

it.each([['1.25', '1.25'], ['1,25', '1.25'], ['0', '0'], ['', '']])(
    'keeps manual numeric entry and clearing: %s', (text, expected) => {
        const onChange = jest.fn();
        const tree = renderer.create(<AmountInput onChange={onChange} valueType={AmountValueType.Native} />);
        const input = tree.root.findByType(TextInput);
        act(() => input.props.onFocus());
        act(() => input.props.onChangeText(text));
        expect(onChange).toHaveBeenCalledWith(expected);
    },
);

it('updates values set by the app without treating them as user edits', () => {
    const onChange = jest.fn();
    const tree = renderer.create(<AmountInput value="0" onChange={onChange} />);
    act(() => tree.update(<AmountInput value="12.5" onChange={onChange} />));
    expect(tree.root.findByType(TextInput).props.value).toBe('12.5');
    expect(onChange).not.toHaveBeenCalled();
});

it('applies an accepted edit before a delayed render or signing lock can lose it', () => {
    let editable = true;
    const onChange = jest.fn();
    const tree = renderer.create(
        <AmountInputEditingContext.Provider value={() => editable}>
            <AmountInput value="0" onChange={onChange} />
        </AmountInputEditingContext.Provider>,
    );
    const component = tree.root.find(node => typeof node.instance?.onValueChange === 'function').instance;
    jest.spyOn(component, 'setState').mockImplementation(() => {});
    const input = tree.root.findByType(TextInput);
    act(() => input.props.onFocus());
    act(() => input.props.onChangeText('2.5'));
    editable = false;
    expect(onChange).toHaveBeenCalledWith('2.5');
    act(() => input.props.onChangeText('123'));
    expect(onChange).toHaveBeenCalledTimes(1);
});

it('excludes amount fields from OS autofill and keyboard corrections', () => {
    const tree = renderer.create(<AmountInput />);
    expect(tree.root.findByType(TextInput).props).toMatchObject({
        autoComplete: 'off', textContentType: 'none', importantForAutofill: 'noExcludeDescendants',
        autoCorrect: false, spellCheck: false, autoCapitalize: 'none',
    });
});
