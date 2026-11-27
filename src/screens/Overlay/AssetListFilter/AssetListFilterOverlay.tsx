/**
 * Add Currency Screen
 */

// import { countBy, filter, forEach, sortBy } from 'lodash';
import React, { Component } from 'react';
import {
    // InteractionManager,
    // KeyboardEvent,
    // InteractionManager,
    // ScrollView,
    // Text,
    View,
    TextInput as NativeTextInput,
    Platform,
    findNodeHandle,
    NativeSyntheticEvent,
    TargetedEvent,
} from 'react-native';

import Keyboard from '@common/helpers/keyboard';
import { AdaptiveOverlayKeyboard } from '@common/helpers/adaptiveOverlayKeyboard';
import { AndroidWindowSurroundContext } from '@common/helpers/androidWindowContext';

import { Navigator } from '@common/helpers/navigator';
// import { Toast } from '@common/helpers/interface';
import { AppScreens } from '@common/constants';

// import { AccountRepository } from '@store/repositories';
// import { AccountModel, TrustLineModel } from '@store/models';

// import NetworkService from '@services/NetworkService';
// import LedgerService from '@services/LedgerService';

// import { CalculateAvailableBalance } from '@common/utils/balance';
// import { DecodeAccountId } from '@common/utils/codec';

// import { LedgerEntry } from '@common/libs/ledger/types/ledger';
// import { LedgerEntryTypes } from '@common/libs/ledger/types/enums';

// components
import { ActionPanel } from '@components/General';

// import { TokenAvatar, TokenIcon } from '@components/Modules/TokenElement';

// import Localize from '@locale';

// style
import { AppSizes, AppStyles } from '@theme';
// import styles from './styles';
import { FiltersType, ListFilter } from '@components/Modules/AssetsList/Tokens/ListFilter';

/* types ==================================================================== */
export interface Props {
    // account: AccountModel;
    filters?: FiltersType;
    visible: boolean;
    onFilterChange: (filters: FiltersType | undefined) => void;
    onReorderPress: () => void;
    onTokenAddPress: () => void;
    onReorderSavePress: () => void;
    hideTopElements: (toggle: boolean, onComplete?: () => void) => void;
    onAddTokenPress: () => void;
}

export interface State {
    // isLoading: boolean;
    // accountObjects: any;
    // nfTokenPageCount: number;
    // networkReserve: { BaseReserve: number; OwnerReserve: number };
    // isSignable: boolean;
    actionPanelExtraHeight: number;
    keyboardOffset: number;
}

/* Component ==================================================================== */
class AssetListFilterOverlay extends Component<Props, State> {
    static screenName = AppScreens.Overlay.AssetListFilter;
    static contextType = AndroidWindowSurroundContext;
    declare context: React.ContextType<typeof AndroidWindowSurroundContext>;

    private actionPanelRef: React.RefObject<ActionPanel>;

    private setListenerTimeout?: ReturnType<typeof setTimeout>;
    private closing = false;
    private closeSettled = false;
    private afterClose?: () => void;
    private adaptiveOffset = 0;
    private ownedSearchInput: ReturnType<typeof NativeTextInput.State.currentlyFocusedInput> | null = null;
    private adaptiveKeyboard = new AdaptiveOverlayKeyboard({
        getContext: () => this.getOwnedSearchInput() ? this.context : undefined,
        getInput: () => this.getOwnedSearchInput(),
        getOffset: () => this.adaptiveOffset,
        getAppliedOffset: () => this.actionPanelRef.current?.offsetFromRest ?? 0,
        setOffset: (offset, isCurrent) => {
            this.adaptiveOffset = offset;
            if (offset === 0) {
                this.setState({ keyboardOffset: 0 });
                if (!this.closing) this.actionPanelRef.current?.snapTo(1);
                return;
            }
            this.setState({ keyboardOffset: offset }, () => {
                setTimeout(() => {
                    if (isCurrent() && !this.closing) this.actionPanelRef.current?.snapTo(offset > 0 ? 2 : 1);
                }, 10);
            });
        },
    });

    static options() {
        return {
            statusBar: {
                visible: true,
                style: 'light',
            },
            topBar: {
                visible: false,
            },
        };
    }

    constructor(props: Props) {
        super(props);

        this.state = {
            actionPanelExtraHeight: 0,
            keyboardOffset: 0,
        //     // isLoading: true,
        //     // accountObjects: [],
        //     // nfTokenPageCount: 0,
        //     // networkReserve: NetworkService.getNetworkReserve(),
        //     // isSignable: true,
        };

        this.actionPanelRef = React.createRef();
    }

    componentDidMount() {
        this.adaptiveKeyboard.mount();

        // check if account is signable
        // const isSignable = AccountRepository.isSignable(account);
        // this.setState({
        //     isSignable,
        // });

        this.setListenerTimeout = setTimeout(() => {
            Keyboard.addListener('keyboardWillShow', this.onKeyboardShow);
            Keyboard.addListener('keyboardWillHide', this.onKeyboardHide);
        }, 500);
    }

    componentDidUpdate() {
        this.adaptiveKeyboard.contextChanged();
    }

    componentWillUnmount() {
        this.adaptiveKeyboard.unmount();
        const { hideTopElements } = this.props;
        hideTopElements(false, this.closeSettled ? this.afterClose : undefined);
        this.afterClose = undefined;
        if (this.setListenerTimeout) clearTimeout(this.setListenerTimeout);

        Keyboard.removeListener('keyboardWillShow', this.onKeyboardShow);
        Keyboard.removeListener('keyboardWillHide', this.onKeyboardHide);
    }

    onClosePress = (afterClose?: () => void) => {
        if (this.closing) return;
        this.adaptiveKeyboard.cancel();
        this.closing = true;
        this.afterClose = afterClose;
        this.actionPanelRef?.current?.slideDown();
        Keyboard.removeListener('keyboardWillShow', this.onKeyboardShow);
        Keyboard.removeListener('keyboardWillHide', this.onKeyboardHide);
    };

    onSlideDown = () => {
        this.adaptiveKeyboard.cancel();
        this.closeSettled = true;
        return Navigator.dismissOverlay(AppScreens.Overlay.AssetListFilter);
    };

    onCloseRequest = () => {
        this.adaptiveKeyboard.cancel();
        this.closing = true;
    };

    private getOwnedSearchInput = () => {
        if (!this.ownedSearchInput) return null;
        return NativeTextInput.State.currentlyFocusedInput() === this.ownedSearchInput ? this.ownedSearchInput : null;
    };

    private onSearchFocus = (event: NativeSyntheticEvent<TargetedEvent>) => {
        const input = NativeTextInput.State.currentlyFocusedInput();
        if (!input || event.nativeEvent.target !== findNodeHandle(input)) return;
        this.ownedSearchInput = input;
        this.adaptiveKeyboard.focus();
    };

    private onSearchBlur = (event: NativeSyntheticEvent<TargetedEvent>) => {
        const input = this.ownedSearchInput;
        if (!input || event.nativeEvent.target !== findNodeHandle(input) ||
            NativeTextInput.State.currentlyFocusedInput() === input) return;
        this.ownedSearchInput = null;
        this.adaptiveKeyboard.hide();
    };

    onKeyboardShow = () => {
        if (Platform.OS === 'android' && this.context && !this.getOwnedSearchInput()) return;
        if (this.adaptiveKeyboard.show((isCurrent) => this.onLegacyKeyboardShow(isCurrent))) return;
        this.onLegacyKeyboardShow();
    };

    private onLegacyKeyboardShow = (isCurrent?: () => boolean) => {
        setTimeout(() => {
            if (isCurrent && !isCurrent()) return;
            if (this.actionPanelRef?.current) {
                this.actionPanelRef?.current.snapTo(2);
            }
        }, 10);
    };

    onKeyboardHide = () => {
        if (this.adaptiveKeyboard.hide()) return;
        if (this.actionPanelRef?.current) {
            this.actionPanelRef?.current.snapTo(1);
        }
    };

    render() {
        const {
            filters,
            onFilterChange,
            onReorderPress,
            onAddTokenPress,
        } = this.props;
        const { actionPanelExtraHeight, keyboardOffset } = this.state;
        const adaptive = Platform.OS === 'android' && this.context !== undefined;
        // const { isLoading, isSignable } = this.state;

        return (
            <ActionPanel
                height={400 + AppSizes.safeAreaBottomInset + actionPanelExtraHeight}
                offset={adaptive ? keyboardOffset : undefined}
                ref={this.actionPanelRef}
                onSlideDown={this.onSlideDown}
                onCloseRequest={this.onCloseRequest}
                lockAfterCloseRequest
            >
                <View style={[AppStyles.column, AppStyles.centerAligned]}
                    {...{
                        onFocus: adaptive ? this.onSearchFocus : undefined,
                        onBlur: adaptive ? this.onSearchBlur : undefined,
                        collapsable: adaptive ? false : undefined,
                    }}>
                    <ListFilter
                        filters={filters}
                        visible
                        onAddTokenPress={() => {
                            this.onClosePress(onAddTokenPress);
                        }}
                        onFilterChange={(...args) => {
                            onFilterChange(...args);
                        }}
                        onReorderPress={() => {
                            this.onClosePress(onReorderPress);
                        }}
                    />
                </View>
            </ActionPanel>
        );
    }
}

/* Export Component ==================================================================== */
export default AssetListFilterOverlay;
