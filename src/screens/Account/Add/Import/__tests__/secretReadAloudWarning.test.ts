/**
 * Import flow: screen reader users are asked to use headphones before they type a secret.
 */
import { WarnSecretReadAloud } from '@common/helpers/accessibility';

import AccountImportView, { SECRET_ENTRY_STEPS } from '../AccountImportView';
import { ImportSteps } from '../types';

jest.mock('@common/helpers/accessibility', () => ({ WarnSecretReadAloud: jest.fn() }));
jest.mock('tangem-sdk-react-native', () => ({}));
jest.mock('@store/repositories', () => ({
    AccountRepository: {},
    CoreRepository: {},
    ProfileRepository: {},
    NetworkRepository: {},
}));
jest.mock('@services/LedgerService', () => ({}));
jest.mock('@services/BackendService', () => ({}));
jest.mock('@services/NetworkService', () => ({}));
jest.mock('@common/libs/vault', () => ({}));
jest.mock('../Steps', () => ({}));

const make = (props: Record<string, unknown> = {}) => {
    const view = new AccountImportView(props as any);
    (view as any).setAccessLevel = jest.fn();
    return view;
};

const moveTo = (view: AccountImportView, step: ImportSteps) => {
    const prevState = view.state;
    view.state = { ...view.state, currentStep: step };
    view.componentDidUpdate({} as any, prevState);
};

describe('[AccountImportView] read-aloud warning', () => {
    beforeEach(() => {
        jest.mocked(WarnSecretReadAloud).mockClear();
    });

    it('covers every step where a secret is typed', () => {
        expect(SECRET_ENTRY_STEPS).toEqual(['EnterSecretNumbers', 'EnterMnemonic', 'EnterSeed']);
    });

    it('warns when the flow opens on a secret entry step', () => {
        make({ importOfflineSecretNumber: true }).componentDidMount();
        expect(WarnSecretReadAloud).toHaveBeenCalledTimes(1);
    });

    it('does not warn when the flow opens on another step', () => {
        make().componentDidMount();
        expect(WarnSecretReadAloud).not.toHaveBeenCalled();
    });

    it('warns each time a secret entry step is entered, not on other steps or re-renders', () => {
        const view = make();
        view.componentDidMount();

        moveTo(view, 'SecretType');
        expect(WarnSecretReadAloud).not.toHaveBeenCalled();

        moveTo(view, 'EnterMnemonic');
        expect(WarnSecretReadAloud).toHaveBeenCalledTimes(1);

        // a re-render on the same step
        view.componentDidUpdate({} as any, view.state);
        expect(WarnSecretReadAloud).toHaveBeenCalledTimes(1);

        moveTo(view, 'SecretType');
        moveTo(view, 'EnterSeed');
        expect(WarnSecretReadAloud).toHaveBeenCalledTimes(2);
    });
});
