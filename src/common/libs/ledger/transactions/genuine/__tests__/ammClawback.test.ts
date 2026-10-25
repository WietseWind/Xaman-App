/* eslint-disable max-len */

import Localize from '@locale';

import { MutationsMixin } from '@common/libs/ledger/mixin';

import { AMMClawback, AMMClawbackInfo } from '../AMMClawback';
import ammClawbackTemplate from './fixtures/AMMClawbackTx.json';

jest.mock('@services/NetworkService');

const MixedAMMClawback = MutationsMixin(AMMClawback);

describe('AMMClawback tx', () => {
    describe('Class', () => {
        it('Should set tx type if not set', () => {
            const instance = new AMMClawback();
            expect(instance.TransactionType).toBe('AMMClawback');
            expect(instance.Type).toBe('AMMClawback');
        });

        it('Should return right parsed values', () => {
            const { tx, meta }: any = ammClawbackTemplate;
            const instance = new AMMClawback(tx, meta);

            expect(instance.Holder).toBe('rUwaiErsYE5kibUUtaPczXZVVd73VNy4R9');
            expect(instance.Asset).toStrictEqual({ currency: 'USD', issuer: 'rhpHaFggC92ELty3n3yDEtuFgWxXWkUFET' });
            expect(instance.Asset2).toStrictEqual({ currency: 'XRP' });
            expect(instance.Amount).toStrictEqual({
                currency: 'USD',
                issuer: 'rhpHaFggC92ELty3n3yDEtuFgWxXWkUFET',
                value: '1000',
                mpt_issuance_id: undefined,
            });
            expect(instance.Flags).toStrictEqual({ tfClawTwoAssets: false });
        });

        it('Should read tfClawTwoAssets', () => {
            const { tx }: any = ammClawbackTemplate;
            const instance = new AMMClawback({ ...tx, Flags: 1 });

            expect(instance.Flags).toStrictEqual({ tfClawTwoAssets: true });
        });
    });

    describe('Info', () => {
        const { tx, meta }: any = ammClawbackTemplate;
        const instance = new MixedAMMClawback(tx, meta);
        const info = new AMMClawbackInfo(instance, {} as any);

        describe('generateDescription()', () => {
            it('should describe the asset, the amount and where the paired asset goes', () => {
                expect(info.generateDescription()).toEqual(
                    'It claws back USD that rUwaiErsYE5kibUUtaPczXZVVd73VNy4R9 holds in the USD/XRP AMM pool.\n' +
                        'It claws back up to 1000 USD.\n' +
                        'The paired XRP is returned to rUwaiErsYE5kibUUtaPczXZVVd73VNy4R9.',
                );
            });

            it('should describe a clawback of the whole holding of both assets', () => {
                const both = new MixedAMMClawback(
                    {
                        ...tx,
                        Amount: undefined,
                        Flags: 1,
                        Asset2: { currency: 'EUR', issuer: 'rhpHaFggC92ELty3n3yDEtuFgWxXWkUFET' },
                    },
                    meta,
                );
                expect(new AMMClawbackInfo(both, {} as any).generateDescription()).toEqual(
                    'It claws back USD that rUwaiErsYE5kibUUtaPczXZVVd73VNy4R9 holds in the USD/EUR AMM pool.\n' +
                        'It claws back all the USD the holder has in the pool.\n' +
                        'It also claws back the paired EUR.',
                );
            });
        });

        describe('getEventsLabel()', () => {
            it('should return the expected label', () => {
                expect(info.getEventsLabel()).toEqual(Localize.t('events.ammClawback'));
                expect(info.getEventsLabel()).toEqual('AMM Clawback');
            });
        });

        describe('getParticipants()', () => {
            it('should return the expected participants', () => {
                expect(info.getParticipants()).toStrictEqual({
                    start: { address: 'rUwaiErsYE5kibUUtaPczXZVVd73VNy4R9', tag: undefined },
                    end: { address: 'rhpHaFggC92ELty3n3yDEtuFgWxXWkUFET', tag: undefined },
                });
            });
        });

        describe('getMonetaryDetails()', () => {
            it('should return the expected monetary details', () => {
                expect(info.getMonetaryDetails()).toStrictEqual({
                    mutate: {
                        DEC: [],
                        INC: [
                            {
                                action: 'INC',
                                currency: 'USD',
                                issuer: 'rMEdVzU8mtEArzjrN9avm3kA675GX7ez8W',
                                value: '1000',
                            },
                        ],
                    },
                    factor: [
                        {
                            currency: 'USD',
                            value: '1000',
                            effect: 'IMMEDIATE_EFFECT',
                        },
                    ],
                });
            });

            it('should return no factor when no Amount is set', () => {
                const noAmount = new MixedAMMClawback({ ...tx, Amount: undefined }, meta);
                expect(new AMMClawbackInfo(noAmount, {} as any).getMonetaryDetails().factor).toBeUndefined();
            });
        });
    });

    describe('Validation', () => {});
});
