/**
 * Import flow: an upgrade the import switched to by itself must not outlive the secret it was made for.
 *
 * When the entered secret gives the address of a read-only account, the import continues as an upgrade
 * of that account. Going back and entering another secret used to keep that upgrade, which then
 * showed "The entered secret belongs to another r-address" in a plain Add account import.
 */
import { Alert } from 'react-native';

import { AccountRepository } from '@store/repositories';
import { AccessLevels, AccountTypes } from '@store/types';

import LedgerService from '@services/LedgerService';

import Localize from '@locale';

import AccountImportView from '../AccountImportView';
import { ImportSteps } from '../types';

jest.mock('@common/helpers/accessibility', () => ({ WarnSecretReadAloud: jest.fn() }));
jest.mock('tangem-sdk-react-native', () => ({}));
jest.mock('@store/repositories', () => ({
    AccountRepository: { findOne: jest.fn() },
    CoreRepository: {},
    ProfileRepository: {},
    NetworkRepository: {},
}));
jest.mock('@services/LedgerService', () => ({ getAccountInfo: jest.fn() }));
jest.mock('@services/BackendService', () => ({}));
jest.mock('@services/NetworkService', () => ({}));
jest.mock('@common/libs/vault', () => ({}));
jest.mock('../Steps', () => ({}));

const READONLY_A = { address: 'rReadonlyA', accessLevel: AccessLevels.Readonly };
const READONLY_B = { address: 'rReadonlyB', accessLevel: AccessLevels.Readonly };
const FULL_C = { address: 'rFullC', accessLevel: AccessLevels.Full };

const inApp = ((query: { address: string }) =>
    [READONLY_A, READONLY_B, FULL_C].find((account) => account.address === query.address)) as any;

const ENTRY_STEPS: ImportSteps[] = ['EnterMnemonic', 'EnterSeed', 'EnterSecretNumbers'];

const make = (props: Record<string, unknown> = {}, entryStep: ImportSteps = 'EnterMnemonic') => {
    const view = new AccountImportView(props as any);

    // apply state changes at once, as the flow reads them back on the next step
    (view as any).setState = (patch: Record<string, unknown>, callback?: () => void) => {
        view.state = { ...view.state, ...patch };
        if (typeof callback === 'function') {
            callback();
        }
    };

    view.state = {
        ...view.state,
        currentStep: entryStep,
        prevSteps: ['AccessLevel', 'SecretType'],
        account: { type: AccountTypes.Regular, accessLevel: AccessLevels.Full },
    };

    return view;
};

const enterSecretFor = (view: AccountImportView, address: string) => {
    view.state = { ...view.state, importedAccount: { address } as any };
    return view.goNext('ConfirmPublicKey');
};

describe('[AccountImportView] upgrade the import switched to by itself', () => {
    let alertSpy: jest.SpyInstance;

    beforeEach(() => {
        alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
        jest.mocked(LedgerService.getAccountInfo).mockResolvedValue({} as any);
        jest.mocked(AccountRepository.findOne).mockImplementation(inApp);
    });

    afterEach(() => {
        alertSpy.mockRestore();
        jest.clearAllMocks();
    });

    it('continues as an upgrade when the secret gives the address of a read-only account', async () => {
        const view = make();

        await enterSecretFor(view, READONLY_A.address);

        expect(view.state.upgradeAccount).toBe(READONLY_A);
        expect(view.state.currentStep).toBe('ConfirmPublicKey');
        expect(alertSpy).not.toHaveBeenCalled();
    });

    it.each(ENTRY_STEPS)('drops that upgrade when going back to %s', async (entryStep) => {
        const view = make({}, entryStep);

        await enterSecretFor(view, READONLY_A.address);
        view.goBack();

        expect(view.state.currentStep).toBe(entryStep);
        expect(view.state.upgradeAccount).toBeUndefined();
    });

    it('imports another secret as a new account after going back, without the other r-address error', async () => {
        const view = make();

        await enterSecretFor(view, READONLY_A.address);
        view.goBack();
        await enterSecretFor(view, 'rNotInTheApp');

        expect(alertSpy).not.toHaveBeenCalled();
        expect(view.state.currentStep).toBe('ConfirmPublicKey');
        expect(view.state.upgradeAccount).toBeUndefined();
    });

    it('upgrades the other read-only account when the next secret belongs to that one', async () => {
        const view = make();

        await enterSecretFor(view, READONLY_A.address);
        view.goBack();
        await enterSecretFor(view, READONLY_B.address);

        expect(alertSpy).not.toHaveBeenCalled();
        expect(view.state.upgradeAccount).toBe(READONLY_B);
    });

    it('still refuses a secret of an account that already has full access, after going back', async () => {
        const view = make();

        await enterSecretFor(view, READONLY_A.address);
        view.goBack();
        await enterSecretFor(view, FULL_C.address);

        expect(alertSpy).toHaveBeenCalledWith(
            Localize.t('global.error'),
            Localize.t('account.importingSecretAccountExist', { address: FULL_C.address }),
        );
        expect(view.state.currentStep).toBe('EnterMnemonic');
        expect(view.state.upgradeAccount).toBeUndefined();
    });

    it('keeps the upgrade while moving on and back to the address confirmation', async () => {
        const view = make();

        await enterSecretFor(view, READONLY_A.address);
        await view.goNext('SecurityStep');
        expect(view.state.currentStep).toBe('SecurityStep');
        expect(view.state.upgradeAccount).toBe(READONLY_A);

        // the label is skipped for an upgrade
        await view.goNext('LabelStep');
        expect(view.state.currentStep).toBe('FinishStep');

        view.goBack();
        view.goBack();
        expect(view.state.currentStep).toBe('ConfirmPublicKey');
        expect(view.state.upgradeAccount).toBe(READONLY_A);
    });
});

describe('[AccountImportView] upgrade started from the account settings', () => {
    let alertSpy: jest.SpyInstance;

    beforeEach(() => {
        alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
        jest.mocked(LedgerService.getAccountInfo).mockResolvedValue({} as any);
        jest.mocked(AccountRepository.findOne).mockImplementation(inApp);
    });

    afterEach(() => {
        alertSpy.mockRestore();
        jest.clearAllMocks();
    });

    it('refuses a secret that gives another r-address and stays on the entry step', async () => {
        const view = make({ upgradeAccount: READONLY_A });

        await enterSecretFor(view, 'rSomethingElse');

        expect(alertSpy).toHaveBeenCalledWith(
            Localize.t('global.error'),
            Localize.t('account.upgradeAccountSecretIsNotMatch'),
        );
        expect(view.state.currentStep).toBe('EnterMnemonic');
        expect(view.state.upgradeAccount).toBe(READONLY_A);
    });

    it('accepts the matching secret and skips the address confirmation', async () => {
        jest.mocked(AccountRepository.findOne).mockClear();

        const view = make({ upgradeAccount: READONLY_A });

        await enterSecretFor(view, READONLY_A.address);

        expect(alertSpy).not.toHaveBeenCalled();
        expect(view.state.currentStep).toBe('SecurityStep');
        expect(AccountRepository.findOne).not.toHaveBeenCalled();
    });

    it('continues with another read-only account the secret belongs to, and shows its address first', async () => {
        const view = make({ upgradeAccount: READONLY_A });

        await enterSecretFor(view, READONLY_B.address);

        expect(alertSpy).not.toHaveBeenCalled();
        expect(view.state.currentStep).toBe('ConfirmPublicKey');
        expect(view.state.upgradeAccount).toBe(READONLY_B);

        // from there on it is an upgrade like any other: no label step
        await view.goNext('SecurityStep');
        expect(view.state.currentStep).toBe('SecurityStep');
        await view.goNext('LabelStep');
        expect(view.state.currentStep).toBe('FinishStep');
        expect(view.state.upgradeAccount).toBe(READONLY_B);
    });

    it('returns to the account from the account settings on the way back', async () => {
        const view = make({ upgradeAccount: READONLY_A });

        await enterSecretFor(view, READONLY_B.address);
        view.goBack();

        expect(view.state.currentStep).toBe('EnterMnemonic');
        expect(view.state.upgradeAccount).toBe(READONLY_A);

        await enterSecretFor(view, READONLY_A.address);
        expect(alertSpy).not.toHaveBeenCalled();
        expect(view.state.currentStep).toBe('SecurityStep');
        expect(view.state.upgradeAccount).toBe(READONLY_A);
    });

    it('says the account already exists when the secret belongs to an account with full access', async () => {
        const view = make({ upgradeAccount: READONLY_A });

        await enterSecretFor(view, FULL_C.address);

        expect(alertSpy).toHaveBeenCalledTimes(1);
        expect(alertSpy).toHaveBeenCalledWith(
            Localize.t('global.error'),
            Localize.t('account.importingSecretAccountExist', { address: FULL_C.address }),
        );
        expect(view.state.currentStep).toBe('EnterMnemonic');
        expect(view.state.upgradeAccount).toBe(READONLY_A);
    });

    it('keeps the upgrade on every step back', async () => {
        const view = make({ upgradeAccount: READONLY_A });

        await enterSecretFor(view, READONLY_A.address);
        view.goBack();
        expect(view.state.currentStep).toBe('EnterMnemonic');
        expect(view.state.upgradeAccount).toBe(READONLY_A);

        view.goBack();
        view.goBack();
        expect(view.state.upgradeAccount).toBe(READONLY_A);
    });
});

describe('[AccountImportView] account the app already knows for a secret', () => {
    const candidate = (address: string) => ({ address }) as any;

    beforeEach(() => {
        jest.mocked(AccountRepository.findOne).mockImplementation(inApp);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('upgrade: the account being upgraded, also over a curve picked by hand', () => {
        const view = make({ upgradeAccount: READONLY_A });
        const own = candidate(READONLY_A.address);

        expect(view.pickKnownAccount([candidate('rNotInTheApp'), own])).toBe(own);
        expect(view.pickKnownAccount([candidate(READONLY_B.address), own])).toBe(own);
        expect(view.pickKnownAccount([candidate('rNotInTheApp'), own], true)).toBe(own);
    });

    it('upgrade: another read-only account when the secret does not give the one being upgraded', () => {
        const view = make({ upgradeAccount: READONLY_A });
        const other = candidate(READONLY_B.address);

        expect(view.pickKnownAccount([candidate('rNotInTheApp'), other])).toBe(other);
    });

    it('import: the read-only account, not an account with full access or an unknown one', () => {
        const view = make();
        const readonly = candidate(READONLY_B.address);

        expect(view.pickKnownAccount([candidate('rNotInTheApp'), readonly])).toBe(readonly);
        expect(view.pickKnownAccount([candidate(FULL_C.address), readonly])).toBe(readonly);
        expect(view.pickKnownAccount([candidate(FULL_C.address), candidate('rNotInTheApp')])).toBeUndefined();
        expect(view.pickKnownAccount([candidate('rNotInTheApp'), readonly], true)).toBeUndefined();
    });
});
