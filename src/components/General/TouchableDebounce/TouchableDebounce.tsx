/* eslint-disable react/jsx-props-no-spreading */
import React, { PureComponent } from 'react';
import { debounce } from 'lodash';

import { TouchableOpacity, TouchableOpacityProps, GestureResponderEvent } from 'react-native';

interface Props extends TouchableOpacityProps {}

export default class TouchableDebounce extends PureComponent<Props> {
    debouncedOnPress = (event: GestureResponderEvent) => {
        const { onPress } = this.props;

        if (typeof onPress === 'function') {
            onPress(event);
        }
    };

    onPress = debounce(this.debouncedOnPress, 500, { leading: true, trailing: false });

    render() {
        const { accessibilityRole } = this.props;

        // screen readers: something you press is a button, unless the caller says otherwise
        return (
            <TouchableOpacity
                {...this.props}
                accessibilityRole={accessibilityRole ?? 'button'}
                onPress={this.onPress}
            />
        );
    }
}
