/**
 * AmountInput
 *
    <AmountInput />
 *
 */

import React, { PureComponent } from 'react';
import { TextInput, TextStyle, ReturnKeyTypeOptions } from 'react-native';

import Localize from '@locale';
import { noAutofillProps } from '../TextInput/noAutofill';
import { AmountInputEditingContext } from './EditingContext';

/* Types ==================================================================== */
export enum AmountValueType {
    Native = 'Native',
    IOU = 'IOU',
}

interface Props {
    valueType: AmountValueType;
    forwardedRef?: any;
    testID?: string;
    style?: TextStyle | TextStyle[];
    value?: string;
    editable?: boolean;
    fractional?: boolean;
    returnKeyType?: ReturnKeyTypeOptions;
    placeholderTextColor?: string;
    onChange?: (value: string) => void;
}

interface State {
    formatted: string;
    value: string;
}
/* Constants ==================================================================== */
const MAX_NATIVE_DECIMAL_PLACES = 6;
const MAX_IOU_DECIMAL_PLACES = 8;
const MAX_IOU_PRECISION = 16;

/* Component ==================================================================== */
class AmountInput extends PureComponent<Props, State> {
    static contextType = AmountInputEditingContext;
    declare context: React.ContextType<typeof AmountInputEditingContext>;
    declare readonly props: Props & Required<Pick<Props, keyof typeof AmountInput.defaultProps>>;
    private focused = false;

    static defaultProps: Partial<Props> = {
        fractional: true,
        valueType: AmountValueType.Native,
    };

    constructor(props: Props) {
        super(props);

        this.state = {
            formatted: props.value ? AmountInput.format(props.value, props.valueType, props.fractional) : '',
            value: props.value ? AmountInput.normalize(props.value) : '',
        };
    }

    public getValue = (): string => {
        const { value } = this.state;
        return value;
    };

    componentDidUpdate() {
        if (!this.canEdit()) this.focused = false;
    }

    componentWillUnmount() {
        this.focused = false;
    }

    canEdit = () => {
        const { editable } = this.props;
        return this.context() && editable !== false;
    };

    onFocus = () => { this.focused = this.canEdit(); };

    onBlur = () => { this.focused = false; };

    static getDerivedStateFromProps(nextProps: Props, prevState: State): Partial<State> | null {
        if (nextProps.value !== prevState.value) {
            const formatted = nextProps.value
                ? AmountInput.format(nextProps.value, nextProps.valueType, nextProps.fractional)
                : '';
            const value = nextProps.value ? AmountInput.normalize(nextProps.value) : '';

            return {
                formatted,
                value,
            };
        }

        return null;
    }

    static normalize = (value: string): string => {
        if (!value) {
            return '';
        }

        if (typeof value === 'number') return String(value);

        return value.replace(',', '.');
    };

    static format = (value: string, valueType: AmountValueType, fractional?: boolean): string => {
        if (!value) {
            return '';
        }

        // 6 decimal places for native input
        let decimalPlaces = MAX_NATIVE_DECIMAL_PLACES;
        if (valueType === AmountValueType.IOU) {
            decimalPlaces = MAX_IOU_DECIMAL_PLACES;
        }

        let formatted = value;
        let separator = Localize.settings?.separator;

        // in some cases the separator is a special character, if so use default separator
        if (!separator || [',', '.'].indexOf(separator) === -1) {
            separator = '.';
        }

        if (separator === ',') {
            formatted = formatted.replace('.', ',');
        } else {
            formatted = formatted.replace(',', '.');
        }

        // "01" to "1"
        if (formatted.length === 2 && formatted[0] === '0' && formatted[1] !== separator) {
            // eslint-disable-next-line
            formatted = formatted[1];
        }

        if (!fractional) {
            // filter only digits are allowed for non-fractional values
            return formatted.replace(/[^0-9]/g, '');
        }

        // FRACTIONAL values

        // filter only digits and separator
        formatted = formatted.replace(new RegExp(`[^0-9${separator}]`, 'g'), '');

        // remove multiple separator
        if (formatted.split(separator).length > 2) {
            formatted = formatted.replace(new RegExp(`\\${separator}+$`), '');
        }

        // check for decimal places
        if (formatted.split(separator)[1] && formatted.split(separator).reverse()[0].length >= decimalPlaces) {
            formatted = `${formatted.split(separator).reverse()[1]}${separator}${formatted
                .split(separator)
                .reverse()[0]
                .slice(0, decimalPlaces)}`;
        }

        // "." to "0."
        if (formatted.length === 1 && formatted[0] === separator) {
            formatted = `0${separator}`;
        }

        // check for max precision for IOU
        if (valueType === AmountValueType.IOU) {
            if (formatted.replace(separator, '').replace(/0+$/, '').length > MAX_IOU_PRECISION) {
                formatted = formatted.slice(0, formatted.length - 1);
            }
        }

        return formatted;
    };

    onValueChange = (value: string) => {
        // Autofill can deliver text to a field behind an authentication overlay.
        // Never turn a credential such as test123 into a transaction amount.
        if (!this.canEdit()) {
            this.focused = false;
            return;
        }
        if (!this.focused || /[^0-9.,\s]/.test(value)) return;
        const { onChange, fractional, valueType } = this.props;

        const formatted = AmountInput.format(value, valueType, fractional);
        const clean = AmountInput.normalize(formatted);

        // Apply an accepted edit before authentication can start. Deferring the
        // model update to a render callback could lose the last typed amount.
        if (typeof onChange === 'function') onChange(clean);
        this.setState({ formatted, value: clean });
    };

    render() {
        const { style, testID, returnKeyType, placeholderTextColor, forwardedRef } = this.props;
        const { formatted } = this.state;

        return (
            <TextInput
                testID={testID}
                ref={forwardedRef}
                keyboardType="decimal-pad"
                autoCapitalize="none"
                onFocus={this.onFocus}
                onBlur={this.onBlur}
                onChangeText={this.onValueChange}
                returnKeyType={returnKeyType || 'done'}
                placeholder="0"
                style={style}
                value={formatted}
                editable={this.canEdit()}
                placeholderTextColor={placeholderTextColor}
                // eslint-disable-next-line react/jsx-props-no-spreading
                {...noAutofillProps}
            />
        );
    }
}

/* Export Component ==================================================================== */
export const RefForwardingAmountInput = React.forwardRef<TextInput, Props>((props, ref) => {
    // eslint-disable-next-line react/jsx-props-no-spreading
    return <AmountInput {...props} forwardedRef={ref} />;
}) as any;
