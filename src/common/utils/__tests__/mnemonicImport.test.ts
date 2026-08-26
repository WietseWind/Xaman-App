import { derive } from 'xrpl-accountlib';

import {
    deriveMnemonicAccount,
    isLedgerAccountActivated,
    pickMnemonicImport,
} from '../mnemonicImport';

const SAMPLE =
    'lamp elevator orchard music glare night upper race mixture bullet property nasty agent sword blind dynamic gossip life series shrug day ice control reunion';

const SECP_ADDRESS = 'r9w2RvKA6rYyBsN3WWFBuEKB7XM83jVqbU';
const ED_ADDRESS = 'r4wtygUBUyzLiibEwwKsA1YA9CKoWjUujS';

describe('mnemonicImport', () => {
    describe('deriveMnemonicAccount', () => {
        it('defaults to secp256k1 and does not pass algorithm', () => {
            const spy = jest.spyOn(derive, 'mnemonic');
            const account = deriveMnemonicAccount(SAMPLE);

            expect(account.address).toBe(SECP_ADDRESS);
            expect(account.secret.path).toBe("m/44'/144'/0'/0/0");
            expect(account.keypair.publicKey?.startsWith('ED')).toBe(false);
            expect(spy).toHaveBeenCalledWith(SAMPLE);
            spy.mockRestore();
        });

        it('explicit secp256k1 matches default and still omits algorithm', () => {
            const spy = jest.spyOn(derive, 'mnemonic');
            const account = deriveMnemonicAccount(SAMPLE, { algorithm: 'secp256k1' });

            expect(account.address).toBe(SECP_ADDRESS);
            expect(spy).toHaveBeenCalledWith(SAMPLE);
            spy.mockRestore();
        });

        it('ed25519 uses SLIP-0010 and a different account', () => {
            const account = deriveMnemonicAccount(SAMPLE, { algorithm: 'ed25519' });

            expect(account.address).toBe(ED_ADDRESS);
            expect(account.address).not.toBe(SECP_ADDRESS);
            expect(account.secret.path).toBe("m/44'/144'/0'/0'/0'");
            expect(account.keypair.publicKey?.startsWith('ED')).toBe(true);
        });
    });

    describe('isLedgerAccountActivated', () => {
        it('is false for missing info or actNotFound', () => {
            expect(isLedgerAccountActivated(undefined)).toBe(false);
            expect(isLedgerAccountActivated({ error: 'actNotFound' })).toBe(false);
        });

        it('is true when account_data is present', () => {
            expect(isLedgerAccountActivated({ account_data: { Balance: '1' } })).toBe(true);
        });
    });

    describe('pickMnemonicImport', () => {
        it('uses explicit secp without fetching account info', async () => {
            const getAccountInfo = jest.fn();
            const picked = await pickMnemonicImport({
                mnemonic: SAMPLE,
                explicitAlgorithm: 'secp256k1',
                getAccountInfo,
            });

            expect(picked).toEqual({
                status: 'ready',
                algorithm: 'secp256k1',
                account: expect.objectContaining({ address: SECP_ADDRESS }),
            });
            expect(getAccountInfo).not.toHaveBeenCalled();
        });

        it('uses explicit ed25519 without fetching account info', async () => {
            const getAccountInfo = jest.fn();
            const picked = await pickMnemonicImport({
                mnemonic: SAMPLE,
                explicitAlgorithm: 'ed25519',
                getAccountInfo,
            });

            expect(picked).toEqual({
                status: 'ready',
                algorithm: 'ed25519',
                account: expect.objectContaining({ address: ED_ADDRESS }),
            });
            expect(getAccountInfo).not.toHaveBeenCalled();
        });

        it('autodetect falls back to secp when neither account is activated', async () => {
            const getAccountInfo = jest.fn().mockResolvedValue({ error: 'actNotFound' });
            const picked = await pickMnemonicImport({
                mnemonic: SAMPLE,
                getAccountInfo,
            });

            expect(picked.status).toBe('ready');
            if (picked.status === 'ready') {
                expect(picked.algorithm).toBe('secp256k1');
                expect(picked.account.address).toBe(SECP_ADDRESS);
            }
            expect(getAccountInfo).toHaveBeenCalledWith(SECP_ADDRESS);
            expect(getAccountInfo).toHaveBeenCalledWith(ED_ADDRESS);
        });

        it('autodetect uses ed25519 when only that account is activated', async () => {
            const getAccountInfo = jest.fn(async (address: string) => {
                if (address === ED_ADDRESS) {
                    return { account_data: { Account: ED_ADDRESS, Balance: '1000000' } };
                }
                return { error: 'actNotFound' };
            });

            const picked = await pickMnemonicImport({
                mnemonic: SAMPLE,
                getAccountInfo,
            });

            expect(picked.status).toBe('ready');
            if (picked.status === 'ready') {
                expect(picked.algorithm).toBe('ed25519');
                expect(picked.account.address).toBe(ED_ADDRESS);
            }
        });

        it('autodetect keeps secp when only secp is activated', async () => {
            const getAccountInfo = jest.fn(async (address: string) => {
                if (address === SECP_ADDRESS) {
                    return { account_data: { Account: SECP_ADDRESS, Balance: '1000000' } };
                }
                return { error: 'actNotFound' };
            });

            const picked = await pickMnemonicImport({
                mnemonic: SAMPLE,
                getAccountInfo,
            });

            expect(picked.status).toBe('ready');
            if (picked.status === 'ready') {
                expect(picked.algorithm).toBe('secp256k1');
                expect(picked.account.address).toBe(SECP_ADDRESS);
            }
        });

        it('autodetect reports a conflict when both accounts are activated', async () => {
            const getAccountInfo = jest.fn(async (address: string) => {
                return { account_data: { Account: address, Balance: '1000000' } };
            });

            const picked = await pickMnemonicImport({
                mnemonic: SAMPLE,
                getAccountInfo,
            });

            expect(picked.status).toBe('conflict');
            if (picked.status === 'conflict') {
                expect(picked.secp.address).toBe(SECP_ADDRESS);
                expect(picked.ed.address).toBe(ED_ADDRESS);
            }
        });

        it('treats getAccountInfo failures as not activated and defaults to secp', async () => {
            const getAccountInfo = jest.fn().mockRejectedValue(new Error('offline'));
            const picked = await pickMnemonicImport({
                mnemonic: SAMPLE,
                getAccountInfo,
            });

            expect(picked.status).toBe('ready');
            if (picked.status === 'ready') {
                expect(picked.algorithm).toBe('secp256k1');
                expect(picked.account.address).toBe(SECP_ADDRESS);
            }
        });
    });
});
