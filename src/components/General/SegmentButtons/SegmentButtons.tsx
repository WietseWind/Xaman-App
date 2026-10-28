import React, { PureComponent } from 'react';
import { FlatList, ViewStyle } from 'react-native';

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
        requestAnimationFrame(() => this.list.current?.scrollToEnd({ animated: false }));
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
                contentContainerStyle={styles.content}
                onContentSizeChange={this.revealActive}
            />
        );
    }
}

/* Export Component ==================================================================== */
export default SegmentButtons;
