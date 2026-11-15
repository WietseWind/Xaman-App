/**
 * Import: the accounts a secret can give, one per curve.
 */
import { derive, generate } from 'xrpl-accountlib';

import { deriveFamilySeedCandidates } from '../familySeedImport';
import { deriveMnemonicAccount, deriveMnemonicCandidates, pickMnemonicImport } from '../mnemonicImport';

const MNEMONIC = [
    'lamp elevator orchard music glare night upper race mixture bullet property nasty',
    'agent sword blind dynamic gossip life series shrug day ice control reunion',
].join(' ');
const MNEMONIC_SECP = 'r9w2RvKA6rYyBsN3WWFBuEKB7XM83jVqbU';
const MNEMONIC_ED = 'r4wtygUBUyzLiibEwwKsA1YA9CKoWjUujS';

const SEED = 'snYHBZDJ51PPSuzWYVhEh1kb9zvEU';
const SEED_SECP = 'rJ9uJ32u3Y46RenZrfvdYWjVf5ReKwf5Wr';
const SEED_ED = 'raKHBXGhVR5nXKtSCeyGqBjswbboUa17tC';

describe('deriveMnemonicCandidates', () => {
    it('gives the secp256k1 and the ed25519 account', () => {
        const { secp, ed } = deriveMnemonicCandidates(MNEMONIC);

        expect(secp.address).toBe(MNEMONIC_SECP);
        expect(secp.keypair.publicKey?.startsWith('ED')).toBe(false);
        expect(ed.address).toBe(MNEMONIC_ED);
        expect(ed.keypair.publicKey?.startsWith('ED')).toBe(true);
    });

    it('takes the passphrase into account on both curves', () => {
        const options = { passphrase: 'another wallet' };
        const { secp, ed } = deriveMnemonicCandidates(MNEMONIC, options);

        expect(secp.address).toBe(deriveMnemonicAccount(MNEMONIC, options).address);
        expect(ed.address).toBe(deriveMnemonicAccount(MNEMONIC, { ...options, algorithm: 'ed25519' }).address);
        expect(secp.address).not.toBe(MNEMONIC_SECP);
        expect(ed.address).not.toBe(MNEMONIC_ED);
    });
});

describe('pickMnemonicImport with accounts that were derived before', () => {
    const absent = async () => ({ error: 'actNotFound' });

    it('gives the same answer and does not derive again', async () => {
        const derived = deriveMnemonicCandidates(MNEMONIC);
        const spy = jest.spyOn(derive, 'mnemonic');

        const auto = await pickMnemonicImport({ mnemonic: MNEMONIC, getAccountInfo: absent, derived });
        expect(auto).toEqual({ status: 'ready', algorithm: 'secp256k1', account: derived.secp });

        const ed = await pickMnemonicImport({
            mnemonic: MNEMONIC,
            explicitAlgorithm: 'ed25519',
            getAccountInfo: absent,
            derived,
        });
        expect(ed).toEqual({ status: 'ready', algorithm: 'ed25519', account: derived.ed });

        const secp = await pickMnemonicImport({
            mnemonic: MNEMONIC,
            explicitAlgorithm: 'secp256k1',
            getAccountInfo: absent,
            derived,
        });
        expect(secp).toEqual({ status: 'ready', algorithm: 'secp256k1', account: derived.secp });

        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it('still picks ed25519 when only that account is activated', async () => {
        const derived = deriveMnemonicCandidates(MNEMONIC);
        const getAccountInfo = async (address: string) =>
            address === MNEMONIC_ED ? { account_data: { Account: address } } : { error: 'actNotFound' };

        const picked = await pickMnemonicImport({ mnemonic: MNEMONIC, getAccountInfo, derived });
        expect(picked).toEqual({ status: 'ready', algorithm: 'ed25519', account: derived.ed });
    });
});

describe('deriveFamilySeedCandidates', () => {
    it('gives the secp256k1 and the ed25519 account for a seed with two curves', () => {
        const candidates = deriveFamilySeedCandidates(SEED);

        expect(candidates.map((account) => account.address)).toEqual([SEED_SECP, SEED_ED]);
        expect(candidates[1].keypair.publicKey?.startsWith('ED')).toBe(true);
    });

    it('gives one account for an sEd seed', () => {
        const generated = generate.familySeed({ algorithm: 'ed25519' });
        const seed = generated.secret.familySeed as string;
        expect(seed.startsWith('sEd')).toBe(true);

        const candidates = deriveFamilySeedCandidates(seed);

        expect(candidates.map((account) => account.address)).toEqual([generated.address]);
    });

    it('throws for an invalid seed, as the import does', () => {
        expect(() => deriveFamilySeedCandidates('snotaseed')).toThrow();
    });
});
