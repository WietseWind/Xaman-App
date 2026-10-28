import renderer from 'react-test-renderer';
import { CoreRepository } from '@store/repositories';
import { SegmentButtons } from '@components/General';
import EventsView from '../EventsView';

jest.mock('@services/NetworkService');
jest.mock('@services/BackendService', () => ({ __esModule: true, default: { ping: jest.fn() } }));
jest.mock('@components/General', () => ({
    Spacer: () => null, Button: () => null, Header: () => null, SearchBar: () => null, SegmentButtons: () => null,
}));
jest.mock('@components/Modules', () => ({ EventsFilterChip: () => null, EventsList: () => null }));

const owner = 'rQQQrUdN1cLdNmxH4dHfKgmX5P4kf3ZrM';
const delegate = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const outgoing = { Type: 'Delegate', Account: owner, Authorize: delegate, Permissions: [{ Permission: {
    PermissionValue: 'NFTokenModify',
} }] };
const incoming = { Type: 'Delegate', Account: delegate, Authorize: owner, Permissions: [] };
const other = { Type: 'Ticket', Account: owner, Flags: {} };
const objects = [outgoing, incoming, other];
const rows = (view: EventsView) => view.state.dataSource.flatMap(section => section.data);
const setup = (section = 'AUTHORISATIONS') => {
    const view = new EventsView({});
    Object.assign(view.state, { activeSection: section, plannedTransactions: objects, canLoadMore: false });
    jest.spyOn(view, 'setState').mockImplementation((update: any, callback?: () => void) => {
        Object.assign(view.state, typeof update === 'function' ? update(view.state, view.props) : update);
        callback?.();
    });
    return view;
};

beforeEach(() => {
    jest.spyOn(CoreRepository, 'getSettings').mockReturnValue({} as any);
    jest.spyOn(CoreRepository, 'getDefaultAccount').mockReturnValue({ address: owner, isValid: () => true } as any);
});
afterEach(() => jest.restoreAllMocks());

it('adds the fifth category and places only incoming and outgoing Delegate objects there', () => {
    const view = setup();
    view.applyDefaults();
    expect(rows(view)).toEqual([incoming, outgoing]);
    const tree = renderer.create(view.render());
    const { buttons } = tree.root.findByType(SegmentButtons).props;
    expect(buttons.map((button: any) => button.value))
        .toEqual(['ALL', 'PLANNED', 'REQUESTS', 'OWNED', 'AUTHORISATIONS']);
    expect(buttons[4].label).toBe('Authorisations');
});

it.each(['PLANNED', 'OWNED', 'REQUESTS', 'ALL'])('keeps Delegate objects out of %s', section => {
    const view = setup(section);
    view.applyDefaults();
    expect(rows(view)).not.toContain(outgoing);
    expect(rows(view)).not.toContain(incoming);
    if (section === 'PLANNED') expect(rows(view)).toContain(other);
});

it('searches both account directions and permissions without applying transaction filters', () => {
    const view = setup();
    view.applySearch(delegate);
    expect(rows(view)).toEqual([incoming, outgoing]);
    view.applySearch('NFTokenModify');
    expect(rows(view)).toEqual([outgoing]);
    view.applySearch('');
    expect(rows(view)).toHaveLength(2);
    view.applyFilters({ TransactionType: 'Payment', ExpenseType: 'Income' } as any);
    expect(rows(view)).toHaveLength(2);
    expect(view.renderListHeader()).toBeNull();
});

it('reloads ledger objects on refresh and returns an empty source when none are present', async () => {
    const view = setup();
    const loadObjects = jest.spyOn(view, 'loadPlannedTransactions').mockResolvedValue([]);
    jest.spyOn(view, 'loadPendingRequests').mockResolvedValue([]);
    const loadTransactions = jest.spyOn(view, 'loadTransactions').mockResolvedValue([]);
    await view.updateDataSource();
    expect(loadObjects).toHaveBeenCalledTimes(1);
    expect(loadTransactions).not.toHaveBeenCalled();
    expect(view.buildDataSource([], [], [other])).toEqual([]);
});
