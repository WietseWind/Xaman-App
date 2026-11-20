import AmountParser from '@common/libs/ledger/parser/common/amount';

import { AmountType } from '@common/libs/ledger/parser/types';
import { LedgerAmount } from '@common/libs/ledger/types/common';

import NetworkService from '@services/NetworkService';

/**
 * A list that is not a list of amount entries cannot be shown, so it cannot be reviewed. The error
 * says which entry is wrong: the review shows it and sends it to the platform as the reason why the
 * sign request was refused, where the developer of the request reads it.
 */
const malformed = (what: string): never => {
    throw new Error(`This transaction cannot be shown: ${what}.`);
};

/* Codec ==================================================================== */
export const Amounts = {
    decode: (_self: any, value: { AmountEntry: { Amount: LedgerAmount } }[]): AmountType[] => {
        if (!Array.isArray(value)) {
            return malformed('Amounts is not a list');
        }

        return value.map((entry, index) => {
            const Amount: unknown = entry?.AmountEntry?.Amount;

            if (typeof Amount === 'string') {
                if (!/^[0-9]+$/.test(Amount)) {
                    return malformed(`Amounts[${index}] is not an amount`);
                }

                return {
                    currency: NetworkService.getNativeAsset(),
                    value: new AmountParser(Amount).dropsToNative().toString(),
                };
            }

            if (!entry?.AmountEntry || typeof entry.AmountEntry !== 'object') {
                return malformed(`Amounts[${index}] is not an amount entry`);
            }

            // the value of an issued amount is text; a request can have a number, which the codec signs as it is
            const given: unknown = Amount && typeof Amount === 'object' ? (Amount as { value?: unknown }).value : undefined;
            const value = typeof given === 'number' && Number.isFinite(given) ? String(given) : given;

            if (typeof value !== 'string' || value === '') {
                return malformed(`Amounts[${index}] has no amount`);
            }

            const issued = { ...(Amount as { currency?: string; issuer?: string }), value };

            if (!('currency' in issued)) {
                return {
                    currency: '',
                    value: issued.value,
                    issuer: '',
                };
            }

            return {
                currency: issued.currency!,
                value: issued.value,
                issuer: issued.issuer,
            };
        });
    },
    encode: (_self: any, value: AmountType[]): { AmountEntry: { Amount: LedgerAmount } }[] => {
        return value.map((amount) => {
            if (amount.currency === NetworkService.getNativeAsset()) {
                return {
                    AmountEntry: { Amount: new AmountParser(amount.value, false).nativeToDrops().toString() },
                };
            }

            return {
                AmountEntry: {
                    Amount: {
                        issuer: amount.issuer!,
                        currency: amount.currency,
                        value: amount.value,
                    },
                },
            };
        });
    },
};
