import StyleService from '@services/StyleService';
// import { StyleSheet } from 'react-native';
// import { AppSizes } from '@theme';

const styles = StyleService.create({
    container: {
        // width: AppSizes.screen.width, // Will auto width - this fixes Fold devices
    },
    contentContainerStyle: {
        flexGrow: 0,
    },
    item: {
        position: 'absolute',
        zIndex: 9,
        width: '100%',
    },
});

export default styles;
