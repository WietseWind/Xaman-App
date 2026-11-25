import SelectAccountOverlay from '../SelectAccountOverlay';

it('lists the accounts in the order it is given (the Accounts list order), not A-Z', () => {
    const accounts = [
        { address: 'rZulu', label: 'Zulu' },
        { address: 'rAlpha', label: 'Alpha' },
        { address: 'rMike', label: 'Mike' },
    ] as any;
    const overlay = new SelectAccountOverlay({
        accounts,
        selected: accounts[0],
        onSelect: jest.fn(),
        onClose: jest.fn(),
    } as any);
    overlay.renderRow = jest.fn((item: any) => item.address) as any;
    expect(overlay.renderContent()).toEqual(['rZulu', 'rAlpha', 'rMike']);
});
