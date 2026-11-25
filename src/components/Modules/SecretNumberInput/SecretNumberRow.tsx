/**
 * SecretNumberRow
 *
 */
import { isEqual, get } from 'lodash';
import React, { Component } from 'react';
import { View, Text, Animated } from 'react-native';

import Localize from '@locale';

import { AppStyles, AppColors } from '@theme';
import styles from './styles';

export const ROW_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/* Types ==================================================================== */
interface Props {
    columnsNumber: number;
    rowNumber: number;
    rowActive: boolean;
    currentColumn: number;
    numbers?: Array<number>;
    rowChecksumError?: boolean;
    rowChecksumCorrect?: boolean;
    readonly?: boolean;
}

interface State {}

/* Component ==================================================================== */
class SecretNumberRow extends Component<Props, State> {
    private rowAnimatedValue: Animated.Value;

    declare readonly props: Props & Required<Pick<Props, keyof typeof SecretNumberRow.defaultProps>>;

    static defaultProps: Partial<Props> = {
        columnsNumber: 6,
    };

    constructor(props: Props) {
        super(props);

        this.rowAnimatedValue = new Animated.Value(0);
    }

    shouldComponentUpdate(nextProps: Props) {
        const { numbers, rowChecksumError, rowChecksumCorrect, currentColumn, rowActive } = this.props;

        return (
            !isEqual(nextProps.currentColumn, currentColumn) ||
            !isEqual(nextProps.numbers, numbers) ||
            !isEqual(nextProps.rowChecksumError, rowChecksumError) ||
            !isEqual(nextProps.rowChecksumCorrect, rowChecksumCorrect) ||
            !isEqual(nextProps.rowActive, rowActive)
        );
    }

    renderColumns = () => {
        const { rowNumber, numbers, currentColumn, rowChecksumError, readonly, columnsNumber } = this.props;

        const columns = [];

        for (let i = 0; i < columnsNumber; i++) {
            const colActive = i === currentColumn;

            const value = get(numbers, `[${i}]`, false);

            columns.push(
                i === 0 || i === 6 ? null : (
                    <View
                        key={`${i}_separator`}
                        style={[
                            styles.separator,
                            rowChecksumError && { backgroundColor: AppColors.red, borderColor: AppColors.red },
                            readonly && { backgroundColor: AppColors.orange, borderColor: AppColors.orange },
                        ]}
                    />
                ),
                <View
                    key={`${i}`}
                    style={[
                        styles.inputBox,
                        colActive && !readonly && styles.inputBoxActive,
                        styles.inputBoxRowActive,
                        rowChecksumError && styles.inputBoxActiveError,
                    ]}
                >
                    <Text
                        testID={`${rowNumber}.${i}`}
                        style={[
                            styles.inputText,
                            styles.inputTextActive,
                            readonly && { color: AppColors.orange },
                            rowChecksumError && styles.inputTextError,
                        ]}
                    >
                        {value}
                    </Text>
                </View>,
            );
        }
        return columns;
    };

    // One element per row for screen readers: "Secret numbers of row A, 4 8 2 9 1 7" (digit by digit).
    // Only rendered inside SecretNumberInput's SensitiveAccessibilityView: on Android 14+ only
    // accessibility tools such as TalkBack can read it, the same as the digits on screen.
    rowAccessibilityProps = () => {
        const { rowNumber, numbers } = this.props;

        const digits = (numbers || []).filter((n) => n !== undefined && n !== null && `${n}` !== '');

        return {
            accessible: true,
            accessibilityLabel: Localize.t('account.secretNumbersOfRow', { row: ROW_LETTERS[rowNumber] }),
            accessibilityValue: { text: digits.join(' ') },
        };
    };

    render() {
        const { rowChecksumError, rowChecksumCorrect, rowActive, rowNumber, readonly } = this.props;

        const abcdefgh = ROW_LETTERS;

        if (!rowActive) {
            return (
                <View
                    style={[
                        styles.rowStyle,
                        AppStyles.centerContent,
                        AppStyles.centerAligned,
                        rowChecksumCorrect && !readonly && styles.rowStyleInnerGreen,
                    ]}
                >
                    <Text style={[styles.RowId, rowChecksumCorrect && !readonly && styles.rowStyleInnerGreenText]}>
                        {abcdefgh[rowNumber]}
                    </Text>
                </View>
            );
        }

        return (
            <>
                <Text
                    style={[
                        styles.rowStyleActiveId,
                        { backgroundColor: !readonly ? AppColors.blue : AppColors.orange },
                    ]}
                    // the row element below names the row
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                >
                    {abcdefgh[rowNumber]}
                </Text>
                {/* eslint-disable-next-line react/jsx-props-no-spreading */}
                <View style={[styles.rowStyle, styles.rowStyleActive]} {...this.rowAccessibilityProps()}>
                    <Animated.View
                        style={[
                            AppStyles.row,
                            AppStyles.flex1,
                            styles.rowStyleInnerActive,
                            readonly && styles.rowStyleInnerReadonly,
                            rowChecksumError && styles.rowStyleInnerError,
                            {
                                transform: [
                                    {
                                        translateY: this.rowAnimatedValue.interpolate({
                                            inputRange: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
                                            outputRange: [0, 10, -15, 12, -9, 18, -7, 10, -11, 5, 0],
                                        }),
                                    },
                                    {
                                        translateX: this.rowAnimatedValue.interpolate({
                                            inputRange: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
                                            outputRange: [0, 2, -3, 4, -4, 3, -3, 4, -5, 2, 0],
                                        }),
                                    },
                                ],
                            },
                        ]}
                    >
                        {this.renderColumns()}
                    </Animated.View>
                </View>
            </>
        );
    }
}

/* Export Component ==================================================================== */
export default SecretNumberRow;
