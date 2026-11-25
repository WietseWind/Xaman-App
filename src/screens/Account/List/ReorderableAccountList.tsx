import { ReorderableList } from '@components/General/ReorderableList';
import styles from './styles';

export default class ReorderableAccountList<T> extends ReorderableList<T> {
    static defaultProps = {
        testID: 'account-list-scroll',
        contentContainerStyle: styles.listContent,
        rowStyle: styles.listItem,
    };
}
