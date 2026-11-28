import React from 'react';
import { InteractionManager, StyleSheet, View } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import { AndroidWindowSurroundContext } from '@common/helpers/androidWindowContext';
import TokenItem from '../TokenItem';

jest.mock('@services', () => ({ LedgerService: {} }));
jest.mock('@common/utils/monetary', () => ({ NormalizeCurrencyCode: (value: string) => value }));
jest.mock('@components/General', () => ({
    Button: 'Button', AmountText: 'AmountText', Icon: 'Icon', Badge: 'Badge', BadgeType: {},
}));
jest.mock('@components/Modules/TokenElement', () => ({ TokenAvatar: 'TokenAvatar' }));

it.each([false, true])('fills the pane, retaining row height and action identity (reorder=%s)', (reorderEnabled) => {
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockReturnValue({ cancel: jest.fn() } as any);
    const token = {
        currency: { id: 'public-token' }, balance: '12', isMPToken: () => false,
        isLiquidityPoolToken: () => false, isExternalAsset: () => false,
        getFormattedCurrency: () => 'USD', getFormattedIssuer: () => 'Public issuer',
    } as any;
    const onMoveTopPress = jest.fn();
    const props = { token, index: 1, selfIssued: false, reorderEnabled, discreetMode: false,
        onPress: jest.fn(), onMoveTopPress };
    const render = (fullPane: boolean) => (
        <AndroidWindowSurroundContext.Provider value={fullPane ? {
            left: 0, width: 600, height: 400, columnWidth: 600, scale: 1, fullPane: true,
        } : undefined}>
            {/* eslint-disable-next-line react/jsx-props-no-spreading */}
            <TokenItem {...props} />
        </AndroidWindowSurroundContext.Provider>
    );
    let tree: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(render(false)); });
    const { instance } = tree!.root.findByType(TokenItem);
    const row = () => tree!.root.findAllByType(View).find((node) => node.props.testID === 'public-token')!;
    const original = StyleSheet.flatten(row().props.style);
    act(() => tree!.update(render(true)));
    expect(tree!.root.findByType(TokenItem).instance).toBe(instance);
    expect(StyleSheet.flatten(row().props.style)).toEqual({ ...original, width: '100%' });
    act(() => instance.onMoveTopPress());
    expect(onMoveTopPress).toHaveBeenCalledWith(token, 1);
    act(() => tree!.update(render(false)));
    expect(StyleSheet.flatten(row().props.style)).toEqual(original);
    act(() => tree!.unmount());
    jest.restoreAllMocks();
});
