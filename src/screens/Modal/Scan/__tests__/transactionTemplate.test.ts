import DataStorage from '@store/storage';
import { CoreRepository } from '@store/repositories';

import { AppScreens } from '@common/constants';
import { Navigator } from '@common/helpers/navigator';
import { Payload } from '@common/libs/payload';

import { ComponentTypes } from '@services/NavigationService';

import ScanModal from '../ScanModal';

jest.mock('../CameraScanner', () => () => null);
jest.mock('@services/NetworkService');
jest.mock('@services/LedgerService');

jest.useFakeTimers();

describe('ScanModal transaction templates', () => {
    const Account = 'rXUMMaPpZeZ5amdNwfFCVXhdcTANpigNLL';
    const Delegate = 'rE6wHjDtqWbpvcyZDjhxVrt6ykg4LSwXWz';

    let storage: DataStorage;

    beforeAll(async () => {
        // the modal reads the core settings, back them with a real test store
        if (DataStorage.isDataStoreFileExist()) {
            DataStorage.wipe();
        }
        storage = new DataStorage();
        await storage.initialize();
    });

    afterAll(() => {
        DataStorage.wipe();
        storage.close();
    });

    afterEach(() => jest.restoreAllMocks());

    const scan = (template: Record<string, any>): Payload => {
        const navigatorSpy = jest.spyOn(Navigator, 'showModal');

        new ScanModal({}).handleTransactionTemplate({
            jsonhex: Buffer.from(JSON.stringify(template)).toString('hex').toUpperCase(),
        });
        jest.runAllTimers();

        expect(navigatorSpy).toHaveBeenCalledWith(
            AppScreens.Modal.ReviewTransaction,
            { componentType: ComponentTypes.Modal, payload: expect.any(Payload) },
            { modalPresentationStyle: 'fullScreen' },
        );
        return (navigatorSpy.mock.calls[0][1] as { payload: Payload }).payload;
    };

    it('should keep every field of a TrustSet template in the payload it reviews', () => {
        const template = {
            TransactionType: 'TrustSet',
            Account,
            LimitAmount: { currency: 'USD', issuer: 'rwietsevLFg8XSmG3bEZzFein1g8RBqWDZ', value: '1000' },
            Delegate,
        };

        expect(scan(template).payload.request_json).toEqual(template);
    });

    it('should keep every field of an AccountSet template in the payload it reviews (developer mode)', () => {
        jest.spyOn(CoreRepository, 'isDeveloperModeEnabled').mockReturnValue(true);
        const template = { TransactionType: 'AccountSet', Account, SetFlag: 8, Delegate };

        expect(scan(template).payload.request_json).toEqual(template);
    });
});
