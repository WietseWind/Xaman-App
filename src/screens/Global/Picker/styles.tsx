import { StyleSheet } from 'react-native';

import StyleService from '@services/StyleService';
import { AppSizes, AppFonts } from '@theme';

/* Styles ==================================================================== */
const styles = StyleService.create({
    container: { position: 'relative', flex: 1, flexDirection: 'column' },
    rowContainer: {
        width: '100%',
        paddingHorizontal: AppSizes.paddingSml,
        paddingVertical: AppSizes.paddingSml,
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '$background',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderColor: '$tint',
    },
    itemTitleWrap: {
        flexShrink: 1,
        paddingRight: AppSizes.paddingSml,
    },
    itemTitle: {
        flexWrap: 'wrap',
    },
    checkIcon: {
        tintColor: '$blue',
    },
    descriptionText: {
        // paddingVertical: AppSizes.paddingSml,
        fontFamily: AppFonts.base.family,
        fontSize: AppFonts.base.size,
        fontWeight: 'bold',
        color: '$textPrimary',
    },
});

export default styles;
