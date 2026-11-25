import { StyleSheet } from 'react-native';

export default StyleSheet.create({
    list: { flex: 1, alignSelf: 'stretch' },
    listItem: { zIndex: 0 },
    draggedItem: { zIndex: 10, elevation: 8 },
});
