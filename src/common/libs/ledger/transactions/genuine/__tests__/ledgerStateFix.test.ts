import Localize from '@locale';

import { MutationsMixin } from '@common/libs/ledger/mixin';

import { LedgerStateFix, LedgerStateFixInfo } from '../LedgerStateFix';
import ledgerStateFixTemplate from './fixtures/LedgerStateFixTx.json';

jest.mock('@services/NetworkService');

const MixedLedgerStateFix = MutationsMixin(LedgerStateFix);

const BookDirectory = '7E7B4A4BA5F2A0C3D7A9C0E2D0D7C6B5A4F3E2D1C0B0A0905038D7EA4C68000';

describe('LedgerStateFix tx', () => {
    describe('Class', () => {
        it('Should set tx type if not set', () => {
            const instance = new LedgerStateFix();
            expect(instance.TransactionType).toBe('LedgerStateFix');
            expect(instance.Type).toBe('LedgerStateFix');
        });

        it('Should return right parsed values', () => {
            const { tx, meta }: any = ledgerStateFixTemplate;
            const instance = new LedgerStateFix(tx, meta);

            expect(instance.LedgerFixType).toBe(1);
            expect(instance.Owner).toBe('rhpHaFggC92ELty3n3yDEtuFgWxXWkUFET');
            expect(instance.BookDirectory).toBeUndefined();
        });

        it('Should return the BookDirectory of a book exchange rate fix', () => {
            const { tx }: any = ledgerStateFixTemplate;
            const instance = new LedgerStateFix({ ...tx, LedgerFixType: 2, Owner: undefined, BookDirectory });

            expect(instance.LedgerFixType).toBe(2);
            expect(instance.BookDirectory).toBe(BookDirectory);
        });
    });

    describe('Info', () => {
        const { tx, meta }: any = ledgerStateFixTemplate;
        const instance = new MixedLedgerStateFix(tx, meta);
        const info = new LedgerStateFixInfo(instance, {} as any);

        describe('generateDescription()', () => {
            it('should describe an NFToken page link fix', () => {
                expect(info.generateDescription()).toEqual(
                    'It repairs the links between the NFToken pages of rhpHaFggC92ELty3n3yDEtuFgWxXWkUFET.',
                );
            });

            it('should describe a book exchange rate fix', () => {
                const fix = new MixedLedgerStateFix({ ...tx, LedgerFixType: 2, Owner: undefined, BookDirectory }, meta);
                expect(new LedgerStateFixInfo(fix, {} as any).generateDescription()).toEqual(
                    `It corrects the exchange rate of order book directory ${BookDirectory}.`,
                );
            });

            it('should name a fix type it does not know', () => {
                const fix = new MixedLedgerStateFix({ ...tx, LedgerFixType: 9 }, meta);
                expect(new LedgerStateFixInfo(fix, {} as any).generateDescription()).toEqual(
                    'It applies ledger fix type 9.',
                );
            });
        });

        describe('getEventsLabel()', () => {
            it('should return the expected label', () => {
                expect(info.getEventsLabel()).toEqual(Localize.t('events.ledgerStateFix'));
                expect(info.getEventsLabel()).toEqual('Ledger State Fix');
            });
        });

        describe('getParticipants()', () => {
            it('should return the expected participants', () => {
                expect(info.getParticipants()).toStrictEqual({
                    start: { address: 'rUwaiErsYE5kibUUtaPczXZVVd73VNy4R9', tag: undefined },
                    end: { address: 'rhpHaFggC92ELty3n3yDEtuFgWxXWkUFET', tag: undefined },
                });
            });

            it('should return no end participant without an Owner', () => {
                const fix = new MixedLedgerStateFix({ ...tx, LedgerFixType: 2, Owner: undefined, BookDirectory }, meta);
                expect(new LedgerStateFixInfo(fix, {} as any).getParticipants()).toStrictEqual({
                    start: { address: 'rUwaiErsYE5kibUUtaPczXZVVd73VNy4R9', tag: undefined },
                    end: undefined,
                });
            });
        });

        describe('getMonetaryDetails()', () => {
            it('should return the expected monetary details', () => {
                expect(info.getMonetaryDetails()).toStrictEqual({
                    mutate: {
                        DEC: [],
                        INC: [],
                    },
                    factor: undefined,
                });
            });
        });
    });

    describe('Validation', () => {});
});
