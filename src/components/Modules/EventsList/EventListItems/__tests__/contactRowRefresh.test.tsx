import React from 'react';
import renderer from 'react-test-renderer';
import ResolverService from '@services/ResolverService';
import TransactionItem from '../Transaction';

jest.mock('@services/ResolverService', () => ({
    __esModule: true,
    default: {
        getAccountName: jest.fn(async (address) => ({ address, name: 'Renamed' })),
    },
}));
jest.mock('@services/LedgerService', () => ({ __esModule: true, default: {} }));
jest.mock('@common/helpers/navigator', () => ({}));
jest.mock('@common/libs/ledger/factory', () => ({}));
jest.mock('@components/Modules/TokenElement', () => ({}));
jest.mock('@components/General', () => ({}));
jest.mock('@screens/Events/Details', () => ({}));
jest.mock('@store/repositories/contact', () => ({ __esModule: true, default: { on: jest.fn(), off: jest.fn() } }));
jest.mock('@store/repositories/trustLine', () => ({ __esModule: true, default: {} }));
jest.mock('../Blocks', () => ({ LabelBlock: 'Label', AvatarBlock: 'Avatar' }));
jest.mock('../styles', () => ({}));
jest.mock('@components/Modules/AssetsList/Tokens/TokenItem/styles', () => ({}));
jest.mock('@theme', () => ({ AppStyles: {}, AppSizes: { heightPercentageToDP: (x: number) => x } }));

it('replaces the participant stored in the displayed cached label after rename', async () => {
    // Keep real refresh/cache logic; isolate visual layout and initial ledger lookups.
    const render = jest.spyOn(TransactionItem.prototype, 'render').mockReturnValue(null);
    const mount = jest.spyOn(TransactionItem.prototype, 'componentDidMount').mockImplementation(function (this: any) {
        this.mounted = true;
    });
    const tree = renderer.create(
        <TransactionItem account={{ address: 'rSelf' } as any} item={{ TransactionType: 'Payment' } as any} />,
    );
    const row = tree.getInstance() as any;
    const participant = { address: 'rOther', name: 'Original' };
    row.setState({
        isLoading: false,
        participant,
        cachedTokenDetails: {
            title: React.createElement('Label', { participant }),
            icon: React.createElement('Avatar'),
        },
    });
    row.refreshMatchingParticipant();
    await Promise.resolve();
    await Promise.resolve();
    expect(ResolverService.getAccountName).toHaveBeenCalledWith('rOther', undefined);
    expect(row.state.participant.name).toBe('Renamed');
    expect(row.state.cachedTokenDetails.title.props.participant.name).toBe('Renamed');
    tree.unmount();
    render.mockRestore();
    mount.mockRestore();
});
