/**
 * LedgerService.getAccountSignerList: the accounts that can multi sign for an account.
 * The review of a multi sign request offers only these accounts, so every shape of answer counts:
 * a wrong "empty list" would stop a request that can be signed, a wrong list would offer the wrong accounts.
 */
import LedgerService from '../LedgerService';
import NetworkService from '../NetworkService';

const ACCOUNT = 'rrrrrrrrrrrrrrrrrrrrBZbvji';
const S = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY';
const M = 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq';

const signerList = (...accounts: string[]) => ({
    LedgerEntryType: 'SignerList',
    SignerQuorum: 1,
    SignerEntries: accounts.map((Account) => ({ SignerEntry: { Account, SignerWeight: 1 } })),
});

describe('LedgerService.getAccountSignerList', () => {
    let send: jest.SpyInstance;

    beforeEach(() => {
        send = jest.spyOn(NetworkService, 'send');
    });
    afterEach(() => jest.restoreAllMocks());

    it('asks for the validated account info with the signer lists', async () => {
        send.mockResolvedValue({ account_data: { Account: ACCOUNT, signer_lists: [signerList(S)] } });

        await LedgerService.getAccountSignerList(ACCOUNT);

        expect(send).toHaveBeenCalledWith({
            command: 'account_info',
            account: ACCOUNT,
            ledger_index: 'validated',
            signer_lists: true,
        });
    });

    it('gives the signers when the list is inside account_data (API version 1)', async () => {
        send.mockResolvedValue({ account_data: { Account: ACCOUNT, signer_lists: [signerList(S, M)] } });

        expect(await LedgerService.getAccountSignerList(ACCOUNT)).toStrictEqual([S, M]);
    });

    it('gives the signers when the list is next to account_data (API version 2)', async () => {
        send.mockResolvedValue({ account_data: { Account: ACCOUNT }, signer_lists: [signerList(M)] });

        expect(await LedgerService.getAccountSignerList(ACCOUNT)).toStrictEqual([M]);
    });

    it('gives an empty list when the account has no signer list', async () => {
        send.mockResolvedValue({ account_data: { Account: ACCOUNT, signer_lists: [] } });

        expect(await LedgerService.getAccountSignerList(ACCOUNT)).toStrictEqual([]);
    });

    it.each([
        ['the account is not on this ledger', { error: 'actNotFound', status: 'error' }],
        ['the node gives another error', { error: 'noNetwork' }],
        ['the answer has no account data', { validated: true }],
        ['the answer has no signer lists at all (an older node)', { account_data: { Account: ACCOUNT } }],
        ['the signer lists are not a list', { account_data: { Account: ACCOUNT, signer_lists: 'none' } }],
        ['there is no answer', undefined],
    ])('is not known when %s', async (_, response) => {
        send.mockResolvedValue(response);

        expect(await LedgerService.getAccountSignerList(ACCOUNT)).toBeUndefined();
    });

    it('is not known when the request fails', async () => {
        send.mockRejectedValue(new Error('not connected'));

        expect(await LedgerService.getAccountSignerList(ACCOUNT)).toBeUndefined();
    });

    it('leaves out entries that are not an account', async () => {
        send.mockResolvedValue({
            account_data: {
                Account: ACCOUNT,
                signer_lists: [
                    { SignerEntries: [{ SignerEntry: { Account: S } }, { SignerEntry: {} }, {}, null] },
                    { SignerEntries: 'broken' },
                    null,
                ],
            },
        });

        expect(await LedgerService.getAccountSignerList(ACCOUNT)).toStrictEqual([S]);
    });
});
