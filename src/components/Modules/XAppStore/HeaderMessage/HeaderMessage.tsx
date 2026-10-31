import { isEqual } from 'lodash';
import React, { Component } from 'react';
import { InteractionManager, StyleProp, Text, View, ViewStyle } from 'react-native';

import Preferences from '@common/libs/preferences';
import { XAppOrigin } from '@common/libs/payload';
import { Icon } from '@components/General/Icon';
import { TouchableDebounce } from '@components/General/TouchableDebounce';
import { AppItem, AppType, AppActions } from '@components/Modules/XAppStore/AppsList/AppItem';
import Localize from '@locale';
import styles from './styles';

export type MessageType = {
    id: number;
    title: string;
    content?: string;
    app?: AppType;
};

interface Props {
    visible: boolean;
    message?: MessageType;
    containerStyle?: StyleProp<ViewStyle>;
}

interface State {
    message?: MessageType;
    showMessage: boolean;
}

class HeaderMessage extends Component<Props, State> {
    private mounted = false;
    private checkEpoch = 0;
    private preferenceTask?: ReturnType<typeof InteractionManager.runAfterInteractions>;

    constructor(props: Props) {
        super(props);
        this.state = { message: props.message, showMessage: false };
    }

    componentDidMount() {
        this.mounted = true;
        this.scheduleMessageCheck();
    }

    componentDidUpdate(prevProps: Readonly<Props>) {
        const { message } = this.props;
        if (!isEqual(prevProps.message, message)) this.scheduleMessageCheck();
    }

    componentWillUnmount() {
        this.mounted = false;
        this.checkEpoch += 1;
        this.preferenceTask?.cancel();
    }

    static getDerivedStateFromProps(nextProps: Props, previous: State) {
        if (isEqual(nextProps.message, previous.message)) return null;
        return { message: nextProps.message, showMessage: false };
    }

    scheduleMessageCheck = () => {
        this.preferenceTask?.cancel();
        const epoch = ++this.checkEpoch;
        this.preferenceTask = InteractionManager.runAfterInteractions(() => {
            if (this.mounted && epoch === this.checkEpoch) this.checkShouldShowMessage();
        });
    };

    checkShouldShowMessage = async () => {
        if (!this.mounted) return;
        const { message } = this.props;
        const epoch = ++this.checkEpoch;
        let showMessage = false;
        if (message?.id) {
            try {
                const ignored = await Preferences.get(Preferences.keys.XAPP_STORE_IGNORE_MESSAGE_ID);
                showMessage = !ignored || message.id > Number(ignored);
            } catch {
                // Keep the existing behavior when the preference cannot be read.
            }
        }
        const { message: currentMessage } = this.props;
        if (this.mounted && epoch === this.checkEpoch && isEqual(currentMessage, message)) {
            this.setState({ showMessage });
        }
    };

    onClosePress = () => {
        const { message } = this.state;
        if (!message) return;
        this.checkEpoch += 1;
        this.preferenceTask?.cancel();
        this.setState({ showMessage: false });
        Preferences.set(Preferences.keys.XAPP_STORE_IGNORE_MESSAGE_ID, String(message.id)).catch(() => undefined);
    };

    renderContent = () => {
        const { message } = this.props;
        if (message?.app) {
            return <AppItem item={message.app} variant="featured" action={AppActions.LUNCH_APP}
                origin={XAppOrigin.XAPP_STORE_MESSAGE} />;
        }
        return (
            <View style={styles.textMessage}>
                <Text style={styles.messageText}>{message?.content}</Text>
            </View>
        );
    };

    render() {
        const { containerStyle, visible } = this.props;
        const { showMessage, message } = this.state;
        if (!showMessage || !message || !visible) return null;
        return (
            <View testID="xapp-store-highlight" style={[styles.container, containerStyle]}>
                <View style={styles.headingRow}>
                    <Text style={styles.titleText}>{message.title}</Text>
                    <TouchableDebounce
                        testID="xapp-store-dismiss-highlight"
                        onPress={this.onClosePress}
                        style={styles.closeButton}
                        accessibilityRole="button"
                        accessibilityLabel={Localize.t('global.close')}
                    >
                        <Icon name="IconX" style={styles.closeButtonIcon} size={17} />
                    </TouchableDebounce>
                </View>
                {this.renderContent()}
            </View>
        );
    }
}

export default HeaderMessage;
