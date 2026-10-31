import React, { PureComponent } from 'react';
import { FlatList, View, ViewStyle } from 'react-native';

import { ButtonItem, SegmentButtonType } from './ButtonItem';

import styles from './styles';

/* Types ==================================================================== */
interface State {}

interface Props {
    buttons: SegmentButtonType[];
    activeButton: string;
    containerStyle?: ViewStyle | ViewStyle[];
    onItemPress: (button: SegmentButtonType) => void;
}

/* Component ==================================================================== */
class SegmentButtons extends PureComponent<Props, State> {
    private list = React.createRef<FlatList<SegmentButtonType>>();
    private contentWidth = 0;
    private viewportWidth = 0;
    private offset = 0;

    componentDidMount() {
        this.revealActive();
    }

    componentDidUpdate(prevProps: Props) {
        const { buttons, activeButton } = this.props;
        const prevLast = prevProps.buttons[prevProps.buttons.length - 1]?.value;
        const last = buttons[buttons.length - 1]?.value;
        if (prevProps.activeButton !== activeButton || prevLast !== last) {
            this.revealActive();
        }
    }

    /** Keep the selected end tab on screen, including after leaving and returning to Events. */
    revealActive = () => {
        const { buttons, activeButton } = this.props;
        const list = this.list.current;
        if (!list || !buttons.length || buttons[buttons.length - 1].value !== activeButton) {
            return;
        }
        if (!this.contentWidth || !this.viewportWidth) {
            return;
        }
        // Include the trailing spacer. scrollToEnd stops on the last tab and hides that space.
        const target = Math.max(0, this.contentWidth - this.viewportWidth);
        if (Math.abs(this.offset - target) <= 1) {
            return;
        }
        list.scrollToOffset({ offset: target, animated: false });
    };

    onLayout = (event: { nativeEvent: { layout: { width: number } } }) => {
        this.viewportWidth = event.nativeEvent.layout.width;
        this.revealActive();
    };

    onContentSizeChange = (width: number) => {
        this.contentWidth = width;
        this.revealActive();
    };

    onScroll = (event: { nativeEvent: { contentOffset: { x: number } } }) => {
        this.offset = event.nativeEvent.contentOffset.x;
    };

    onItemPress = (item: SegmentButtonType) => {
        const { onItemPress } = this.props;

        if (typeof onItemPress === 'function') {
            onItemPress(item);
        }
    };

    renderItem = ({ item }: { item: SegmentButtonType; index: number }) => {
        const { activeButton } = this.props;

        return <ButtonItem item={item} onItemPress={this.onItemPress} isActive={activeButton === item.value} />;
    };

    render() {
        const { buttons, containerStyle } = this.props;

        return (
            <FlatList
                ref={this.list}
                horizontal
                data={buttons}
                renderItem={this.renderItem}
                style={[styles.container, containerStyle]}
                ListFooterComponent={<View style={styles.trailing} />}
                onLayout={this.onLayout}
                onContentSizeChange={this.onContentSizeChange}
                onScroll={this.onScroll}
                scrollEventThrottle={16}
            />
        );
    }
}

/* Export Component ==================================================================== */
export default SegmentButtons;
