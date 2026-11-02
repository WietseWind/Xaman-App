import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Navigator } from '@common/helpers/navigator';
import AssetListFilter, { Props } from '../AssetListFilterOverlay';

jest.mock('@common/helpers/navigator', () => ({ Navigator: { dismissOverlay: jest.fn().mockResolvedValue('sheet') } }));
jest.mock('@common/helpers/keyboard', () => ({
    __esModule: true, default: { addListener: jest.fn(), removeListener: jest.fn() },
}));

let tree: renderer.ReactTestRenderer | undefined;
const props = (): Props => ({
    visible: true, onFilterChange: jest.fn(), onReorderPress: jest.fn(), onTokenAddPress: jest.fn(),
    onReorderSavePress: jest.fn(), onAddTokenPress: jest.fn(), hideTopElements: jest.fn(),
});
const mount = (p: Props) => {
    act(() => { tree = renderer.create(React.createElement(AssetListFilter, p)); });
    const overlay = tree!.getInstance() as AssetListFilter;
    (overlay as any).actionPanelRef.current = { slideDown: jest.fn() };
    return overlay;
};
beforeEach(() => {
    jest.clearAllMocks(); jest.useFakeTimers();
    jest.spyOn(AssetListFilter.prototype, 'render').mockReturnValue(null);
});
afterEach(() => { act(() => tree?.unmount()); tree = undefined; jest.restoreAllMocks(); jest.useRealTimers(); });

it.each(['onAddTokenPress', 'onReorderPress'] as const)(
    'runs %s after the sheet closes and the header restore completes', async name => {
        const p = props(); const overlay = mount(p);
        expect(p.hideTopElements).not.toHaveBeenCalled();
        act(() => overlay.onClosePress(p[name]));
        expect(p[name]).not.toHaveBeenCalled();
        await act(async () => { await overlay.onSlideDown(); });
        act(() => tree!.unmount()); tree = undefined;
        expect(p[name]).not.toHaveBeenCalled();
        const [hidden, complete] = jest.mocked(p.hideTopElements).mock.calls[0];
        expect(hidden).toBe(false); complete!();
        expect(p[name]).toHaveBeenCalledTimes(1);
        expect(Navigator.dismissOverlay).toHaveBeenCalledTimes(1);
    },
);

it('cancels the selected action if navigation removes the sheet before its close settles', () => {
    const p = props(); const overlay = mount(p);
    act(() => overlay.onClosePress(p.onAddTokenPress));
    act(() => tree!.unmount()); tree = undefined;
    expect(p.hideTopElements).toHaveBeenCalledWith(false, undefined);
    expect(p.onAddTokenPress).not.toHaveBeenCalled();
});

it('retains only the first selected action during repeated close presses', async () => {
    const p = props(); const overlay = mount(p);
    act(() => { overlay.onClosePress(p.onAddTokenPress); overlay.onClosePress(p.onReorderPress); });
    await act(async () => { await overlay.onSlideDown(); });
    act(() => tree!.unmount()); tree = undefined;
    jest.mocked(p.hideTopElements).mock.calls[0][1]!();
    expect(p.onAddTokenPress).toHaveBeenCalledTimes(1);
    expect(p.onReorderPress).not.toHaveBeenCalled();
});

it('ignores a selection after backdrop dismissal has already requested close', async () => {
    const p = props(); const overlay = mount(p);
    act(() => { overlay.onCloseRequest(); overlay.onClosePress(p.onAddTokenPress); });
    await act(async () => { await overlay.onSlideDown(); });
    act(() => tree!.unmount()); tree = undefined;
    expect(p.hideTopElements).toHaveBeenCalledWith(false, undefined);
    expect(p.onAddTokenPress).not.toHaveBeenCalled();
});
