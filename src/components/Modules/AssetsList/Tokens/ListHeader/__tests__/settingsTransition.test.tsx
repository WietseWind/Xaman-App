import { Navigator } from '@common/helpers/navigator';
import ListHeader from '../ListHeader';

jest.mock('@common/helpers/navigator', () => ({ Navigator: { showOverlay: jest.fn() } }));

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const props = () => ({
    reorderEnabled: false, showTokenAddButton: true, visible: true,
    onTokenAddPress: jest.fn(), onReorderSavePress: jest.fn(), onTitlePress: jest.fn(),
    onFilterChange: jest.fn(), onReorderPress: jest.fn(), hideTopElements: jest.fn(),
});
beforeEach(() => { jest.clearAllMocks(); jest.mocked(Navigator.showOverlay).mockResolvedValue('sheet'); });

it('waits for the header completion and ignores a second press while opening', async () => {
    const p = props(); const header = new ListHeader(p);
    header.tokenListSettingsPress(); header.tokenListSettingsPress();
    expect(p.hideTopElements).toHaveBeenCalledTimes(1);
    expect(Navigator.showOverlay).not.toHaveBeenCalled();
    const [hidden, complete] = p.hideTopElements.mock.calls[0] as unknown as [boolean, () => void];
    expect(hidden).toBe(true); complete(); await flush();
    expect(Navigator.showOverlay).toHaveBeenCalledTimes(1);
    expect(jest.mocked(Navigator.showOverlay).mock.calls[0][1]).toMatchObject({
        onAddTokenPress: p.onTokenAddPress, onReorderPress: p.onReorderPress,
        onFilterChange: p.onFilterChange, hideTopElements: p.hideTopElements,
    });
});

it.each(['declined', 'failed'])('restores the header and allows retry after a %s overlay open', async reason => {
    if (reason === 'declined') jest.mocked(Navigator.showOverlay).mockResolvedValue(false);
    else jest.mocked(Navigator.showOverlay).mockRejectedValue(new Error('Native show failed'));
    const p = props(); const header = new ListHeader(p);
    header.tokenListSettingsPress();
    (p.hideTopElements.mock.calls[0] as unknown as [boolean, () => void])[1](); await flush();
    expect(p.hideTopElements).toHaveBeenLastCalledWith(false);
    header.tokenListSettingsPress();
    expect(p.hideTopElements).toHaveBeenCalledTimes(3);
});
