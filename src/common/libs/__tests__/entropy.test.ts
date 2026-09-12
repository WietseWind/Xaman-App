/* eslint-disable max-len */

import { deriveEntropy } from '../entropy';

describe('Entropy', () => {
    // If this changes you have changed how entropy is derived which will break existing apps that rely on this
    it('deriveEntropy', async () => {
        const privateKeyHex = '000000000000000000000000000000000000000000000000000000000000000';
        const appid = 'your_app_id';
        const salt = 'your_salt';
        const result = await deriveEntropy(privateKeyHex, appid, salt);
        expect(result).toBe('e4a470c0aefd47d2162593ae10dd4e63818299c2bd58ce70aa26857c011980e9');
    });
});
