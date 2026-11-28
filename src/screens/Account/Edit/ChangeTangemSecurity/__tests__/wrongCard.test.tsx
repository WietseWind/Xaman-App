/**
 * Change of the card security (access code, passcode, reset): these operations write to the card.
 *
 * Issue 564: another card than the card of the account ends the card session (the native module checks
 * the card id before anything is written). The app then shows its own "Different card" alert, changes
 * nothing, and the user starts a new scan with Save.
 */
import RNTangemSdk from 'tangem-sdk-react-native';

import { AccountRepository } from '@store/repositories';
import { Prompt } from '@common/helpers/interface';
import { showTangemWrongCard } from '@common/helpers/tangemWrongCard';
import { resetTangemCardPrompts } from '@common/utils/tangemSession';

import ChangeTangemSecurityView from '../ChangeTangemSecurity';

jest.mock('tangem-sdk-react-native', () => ({
    __esModule: true,
    default: {
        startSession: jest.fn(async () => undefined),
        stopSession: jest.fn(async () => undefined),
        setAccessCode: jest.fn(),
        setPasscode: jest.fn(),
        resetUserCodes: jest.fn(),
    },
}));
jest.mock('@store/repositories', () => ({ AccountRepository: { update: jest.fn() } }));
jest.mock('@services/LoggerService', () => ({ __esModule: true, default: { recordError: jest.fn() } }));
jest.mock('@common/helpers/navigator', () => ({ Navigator: { pop: jest.fn(), showAlertModal: jest.fn() } }));
jest.mock('@common/helpers/interface', () => ({ Prompt: jest.fn() }));
jest.mock('@common/helpers/tangemWrongCard', () => ({ showTangemWrongCard: jest.fn() }));
jest.mock('@components/General', () => ({
    Header: 'Header',
    Footer: 'Footer',
    Button: 'Button',
    RadioButton: 'RadioButton',
}));
jest.mock('../styles', () => ({ __esModule: true, default: {} }));

const account: any = {
    address: 'rCardAccount',
    label: 'My card',
    additionalInfo: {
        cardId: 'CB01',
        isAccessCodeSet: false,
        isPasscodeSet: false,
        settings: { isSettingPasscodeAllowed: true, isSettingAccessCodeAllowed: true },
    },
};

const sdkError = (code: string, message = 'sdk error') => Object.assign(new Error(message), { code });

const operations = [
    ['resetUserCodes', 'resetUserCodes', { isPasscodeSet: false, isAccessCodeSet: false }],
    ['changeAccessCode', 'setAccessCode', { isAccessCodeSet: true }],
    ['changePasscode', 'setPasscode', { isPasscodeSet: true }],
] as const;

const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
    jest.clearAllMocks();
    resetTangemCardPrompts();
});

describe.each(operations)('%s', (method, sdkMethod, changes) => {
    it('asks the native module for the card of this account', async () => {
        const sdk = jest.mocked(RNTangemSdk[sdkMethod] as any).mockResolvedValue({ cardId: 'CB01' });
        const view = new ChangeTangemSecurityView({ account });
        view[method]();
        await settle();

        expect(sdk).toHaveBeenCalledWith({ cardId: 'CB01' });
        expect(AccountRepository.update).toHaveBeenCalledWith({
            address: 'rCardAccount',
            additionalInfoString: JSON.stringify({ ...account.additionalInfo, ...changes }),
        });
        expect(Prompt).toHaveBeenCalledTimes(1);
        expect(showTangemWrongCard).not.toHaveBeenCalled();
    });

    it('another card: the app names the right card and changes nothing', async () => {
        jest.mocked(RNTangemSdk[sdkMethod] as any).mockRejectedValue(sdkError('50005'));
        const view = new ChangeTangemSecurityView({ account });
        view[method]();
        await settle();

        expect(showTangemWrongCard).toHaveBeenCalledTimes(1);
        expect(showTangemWrongCard).toHaveBeenCalledWith('My card');
        expect(AccountRepository.update).not.toHaveBeenCalled();
        expect(Prompt).not.toHaveBeenCalled();
    });

    it('the user cancels: no alert, no change', async () => {
        jest.mocked(RNTangemSdk[sdkMethod] as any).mockRejectedValue(
            sdkError('50002', 'The user cancelled the operation'),
        );
        const view = new ChangeTangemSecurityView({ account });
        view[method]();
        await settle();

        expect(showTangemWrongCard).not.toHaveBeenCalled();
        expect(AccountRepository.update).not.toHaveBeenCalled();
    });
});
