import DelegateSet from '../DelegateSet/DelegateSet.class';

jest.mock('@services/NetworkService', () => ({
    __esModule: true,
    default: {
        getRawNetworkDefinitions: () => ({
            TRANSACTION_TYPES: {
                Payment: 0,
                EscrowCreate: 1,
                EscrowFinish: 2,
            },
        }),
    },
}));

describe('DelegateSet permissions', () => {
    it('warns for Payment by name or by permission value, and not for EscrowFinish', () => {
        const tx = new DelegateSet({
            TransactionType: 'DelegateSet',
            Permissions: [
                { Permission: { PermissionValue: 'Payment' } },
                { Permission: { PermissionValue: 1 } },
                { Permission: { PermissionValue: 2 } },
                { Permission: { PermissionValue: 3 } },
                { Permission: { PermissionValue: 'EscrowFinish' } },
            ],
        } as any);

        expect(tx.___translatedDelegations).toEqual([
            'Payment',
            'Payment',
            'EscrowCreate',
            'EscrowFinish',
            'EscrowFinish',
        ]);
        expect(tx.___dangerPerms).toEqual(['Payment', 'Payment', 'EscrowCreate']);
    });
});
