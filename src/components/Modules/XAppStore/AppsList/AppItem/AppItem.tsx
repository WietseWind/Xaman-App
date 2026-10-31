import React, { Component } from 'react';
import {
    View, Text, Animated, Share, Image, PixelRatio, NativeSyntheticEvent, TextLayoutEventData,
} from 'react-native';
import { OptionsModalPresentationStyle, OptionsModalTransitionStyle } from 'react-native-navigation';

import { AppScreens } from '@common/constants';
import { HOSTNAME } from '@common/constants/endpoints';
import { Images } from '@common/helpers/images';
import { XAppOrigin } from '@common/libs/payload';
import { Navigator } from '@common/helpers/navigator';
import { Props as XAppBrowserModalProps } from '@screens/Modal/XAppBrowser/types';
import { TouchableDebounce } from '@components/General/TouchableDebounce';
import { Icon } from '@components/General/Icon';
import { XAppInfoOverlayProps, DisplayButtonTypes } from '@screens/Overlay/XAppInfo';
import Locale from '@locale';
import styles from './styles';

export type AppType = {
    title: string;
    description: string;
    identifier: string;
    icon: string;
    category?: string;
    development?: boolean;
};

export enum AppActions {
    LUNCH_APP = 'LUNCH',
    OPEN_ABOUT = 'ABOUT',
}

export interface Props {
    item?: AppType;
    action: AppActions;
    origin: XAppOrigin;
    variant?: 'tile' | 'featured';
    fontScale?: number;
}

interface State {
    titleLines: number;
    imageFailed: boolean;
}

class AppItem extends Component<Props, State> {
    private readonly placeholderAnimation = new Animated.Value(1);
    private readonly fadeAnimation: Animated.Value;
    private placeholderLoop?: Animated.CompositeAnimation;
    private mounted = false;

    constructor(props: Props) {
        super(props);
        this.fadeAnimation = new Animated.Value(props.item ? 1 : 0);
        this.state = { titleLines: 1, imageFailed: false };
    }

    componentDidMount() {
        this.mounted = true;
        const { item } = this.props;
        if (!item) this.startPlaceholderAnimation();
    }

    componentDidUpdate(prevProps: Props) {
        const { item } = this.props;
        const { titleLines, imageFailed } = this.state;
        if (!prevProps.item && item) {
            this.stopPlaceholderAnimation();
            this.startFadeAnimation();
        } else if (prevProps.item && !item) {
            this.fadeAnimation.stopAnimation();
            this.fadeAnimation.setValue(0);
            this.startPlaceholderAnimation();
        }
        if (prevProps.item?.identifier !== item?.identifier || prevProps.item?.icon !== item?.icon) {
            if (titleLines !== 1 || imageFailed) {
                this.setState({ titleLines: 1, imageFailed: false });
            }
        }
    }

    componentWillUnmount() {
        this.mounted = false;
        this.stopPlaceholderAnimation();
        this.fadeAnimation.stopAnimation();
    }

    startFadeAnimation = () => {
        Animated.timing(this.fadeAnimation, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    };

    startPlaceholderAnimation = () => {
        const { item } = this.props;
        if (!this.mounted || item || this.placeholderLoop) return;
        this.placeholderLoop = Animated.loop(Animated.sequence([
            Animated.timing(this.placeholderAnimation, { toValue: 0.4, duration: 1000, useNativeDriver: true }),
            Animated.timing(this.placeholderAnimation, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ]));
        this.placeholderLoop.start();
    };

    stopPlaceholderAnimation = () => {
        this.placeholderLoop?.stop();
        this.placeholderLoop = undefined;
        this.placeholderAnimation.stopAnimation();
    };

    private openItem = (item: AppType, origin: XAppOrigin) => {
        Navigator.showModal<XAppBrowserModalProps>(
            AppScreens.Modal.XAppBrowser,
            { identifier: item.identifier, title: item.title, icon: item.icon, origin },
            {
                modalTransitionStyle: OptionsModalTransitionStyle.coverVertical,
                modalPresentationStyle: OptionsModalPresentationStyle.overFullScreen,
            },
        );
    };

    openXApp = () => {
        const { item, origin } = this.props;
        if (item?.identifier) this.openItem(item, origin);
    };

    private shareItem = (item: AppType) => {
        Share.share({ title: item.title, message: `https://${HOSTNAME}/detect/xapp:${item.identifier}`, url: undefined });
    };

    shareXApp = () => {
        const { item } = this.props;
        if (item?.identifier) this.shareItem(item);
    };

    openXAppInfo = () => {
        const { item, origin } = this.props;
        if (!item?.identifier) return;
        // About can outlive or recycle its list cell. Its delayed actions keep the clicked app.
        const clicked = { ...item };
        Navigator.showOverlay<XAppInfoOverlayProps>(AppScreens.Overlay.XAppInfo, {
            identifier: clicked.identifier,
            title: clicked.title,
            icon: clicked.icon,
            displayButtonTypes: [DisplayButtonTypes.OPEN, DisplayButtonTypes.SHARE],
            onOpenPress: () => this.openItem(clicked, origin),
            onSharePress: () => this.shareItem(clicked),
        });
    };

    onActionPress = () => {
        const { action } = this.props;
        switch (action) {
            case AppActions.LUNCH_APP: this.openXApp(); break;
            case AppActions.OPEN_ABOUT: this.openXAppInfo(); break;
            default: break;
        }
    };

    onTitleLayout = (event: NativeSyntheticEvent<TextLayoutEventData>, identifier: string) => {
        const { item } = this.props;
        const { titleLines: currentTitleLines } = this.state;
        if (!this.mounted || item?.identifier !== identifier) return;
        const titleLines = Math.max(1, Math.min(2, event.nativeEvent.lines.length));
        if (titleLines !== currentTitleLines) this.setState({ titleLines });
    };

    onImageError = (uri: string) => {
        const { item } = this.props;
        const { imageFailed } = this.state;
        if (this.mounted && item?.icon === uri && !imageFailed) {
            this.setState({ imageFailed: true });
        }
    };

    private tileGeometry = () => {
        const { fontScale: requestedFontScale } = this.props;
        const fontScale = Math.max(1, requestedFontScale ?? PixelRatio.getFontScale());
        const captionHeight = Math.ceil(56 * fontScale);
        return { tile: { height: 68 + captionHeight + 8 }, caption: { height: captionHeight } };
    };

    renderIcon = (featured = false) => {
        const { item } = this.props;
        const { imageFailed } = this.state;
        const failed = imageFailed || !item?.icon;
        return (
            <View style={[styles.iconShadow, featured && styles.featuredIconShadow]}>
                {failed ? (
                    <View style={[styles.appIcon, styles.fallbackIcon, featured && styles.featuredIcon]}>
                        <Icon name="IconXAppCategoryFallback" size={28} style={styles.fallbackGlyph} />
                    </View>
                ) : (
                    <Image
                        source={{ uri: item.icon }}
                        resizeMode="cover"
                        style={[styles.appIcon, featured && styles.featuredIcon]}
                        onError={() => this.onImageError(item.icon)}
                        accessible={false}
                    />
                )}
                {item?.development && (
                    <View style={styles.developmentBadge}>
                        <Icon name="IconSmartPhone" size={10} style={styles.developmentGlyph} />
                    </View>
                )}
            </View>
        );
    };

    renderBackdrop = (featured = false) => {
        const { item } = this.props;
        const { imageFailed } = this.state;
        return (
            <View pointerEvents="none" style={styles.backdropContainer} importantForAccessibility="no-hide-descendants">
                {!!item?.icon && !imageFailed && (
                    <Image
                        source={{ uri: item.icon }}
                        resizeMode="cover"
                        style={featured ? styles.featuredBackdrop : styles.backdrop}
                        accessible={false}
                    />
                )}
                {!featured && <Image source={Images.ImageXAppTileScrim} style={styles.scrim} resizeMode="stretch" />}
            </View>
        );
    };

    renderPlaceholder = () => {
        const geometry = this.tileGeometry();
        return (
            <Animated.View
                testID="xapp-tile-placeholder"
                style={[styles.tile, geometry.tile, { opacity: this.placeholderAnimation }]}
                accessible={false}
            >
                <View style={[styles.iconShadow, styles.placeholderIcon]} />
                <View style={styles.placeholderCaption}>
                    <View style={styles.placeholderTitle} />
                    <View style={styles.placeholderDescription} />
                </View>
            </Animated.View>
        );
    };

    renderFeatured = () => {
        const { item } = this.props;
        if (!item) return this.renderPlaceholder();
        return (
            <Animated.View style={[styles.featured, { opacity: this.fadeAnimation }]}>
                {this.renderBackdrop(true)}
                <TouchableDebounce
                    testID={`xapp-open-${item.identifier}`}
                    style={styles.featuredMain}
                    onPress={this.openXApp}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.title}. ${item.description || ''}`}
                    accessibilityHint={Locale.t('xapp.openXapp')}
                    activeOpacity={0.85}
                >
                    {this.renderIcon(true)}
                    <View style={styles.featuredText}>
                        <Text style={styles.featuredTitle}>{item.title}</Text>
                        <Text style={styles.featuredDescription}>{item.description}</Text>
                    </View>
                </TouchableDebounce>
                <TouchableDebounce
                    testID={`xapp-featured-action-${item.identifier}`}
                    style={styles.featuredButton}
                    onPress={this.onActionPress}
                    accessibilityRole="button"
                    accessibilityLabel={`${Locale.t('xapp.openXapp')} ${item.title}`}
                >
                    <Text style={styles.featuredButtonText}>{Locale.t('xapp.openXapp')}</Text>
                </TouchableDebounce>
            </Animated.View>
        );
    };

    render() {
        const { item, variant, action } = this.props;
        if (!item) return this.renderPlaceholder();
        if (variant === 'featured') return this.renderFeatured();
        const geometry = this.tileGeometry();
        const { titleLines } = this.state;
        return (
            <Animated.View testID={`xapp-tile-${item.identifier}`} style={[styles.tile, geometry.tile,
                { opacity: this.fadeAnimation }]}>
                {this.renderBackdrop()}
                <View pointerEvents="none" style={styles.decoration} importantForAccessibility="no-hide-descendants">
                    {this.renderIcon()}
                    <View style={[styles.caption, geometry.caption]}>
                        <Text
                            style={styles.appTitle}
                            numberOfLines={2}
                            onTextLayout={(event) => this.onTitleLayout(event, item.identifier)}
                        >
                            {item.title}
                        </Text>
                        <Text style={styles.appDescription} numberOfLines={titleLines > 1 ? 1 : 2}>
                            {item.description}
                        </Text>
                    </View>
                </View>
                <TouchableDebounce
                    testID={`xapp-open-${item.identifier}`}
                    style={styles.openTarget}
                    onPress={this.openXApp}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.title}. ${item.description || ''}`}
                    accessibilityHint={Locale.t('xapp.openXapp')}
                />
                {!!action && (
                    <TouchableDebounce
                        testID={`xapp-info-${item.identifier}`}
                        style={styles.infoTarget}
                        onPress={this.onActionPress}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={`${Locale.t(action === AppActions.OPEN_ABOUT
                            ? 'xapp.aboutXapp' : 'xapp.openXapp')} ${item.title}`}
                    >
                        <View style={styles.infoFace}>
                            <Icon name={action === AppActions.OPEN_ABOUT ? 'IconXAppInfo' : 'IconChevronRight'}
                                size={20} style={styles.infoGlyph} />
                        </View>
                    </TouchableDebounce>
                )}
            </Animated.View>
        );
    }
}

export default AppItem;
