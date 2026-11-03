import Localize from '@locale';
import { MPTAmountError, MPT_MAX_AMOUNT, mptRawToDisplay } from '@common/utils/mptAmount';

export const mptAmountMessage = (error: unknown): string => {
    if (!(error instanceof MPTAmountError) || error.reason === 'metadata') {
        return Localize.t('mptoken.errorLoading');
    }
    if (error.reason === 'precision') {
        return Localize.t('send.theMaxDecimalsYouCanSendIs', { decimals: error.scale });
    }
    if (error.reason === 'range') {
        return Localize.t('send.theMaxAmountYouCanSendIs', {
            spendable: mptRawToDisplay(MPT_MAX_AMOUNT, error.scale),
            currency: '',
        });
    }
    return Localize.t('send.pleaseEnterAmount');
};
