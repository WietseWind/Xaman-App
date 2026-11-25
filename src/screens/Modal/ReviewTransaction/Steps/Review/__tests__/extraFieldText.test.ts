import { readableHexText } from '../extraFieldText';

describe('readable extra field hex', () => {
    it('decodes awaken and trailing null padding', () => {
        expect(readableHexText('6177616B656E')).toBe('awaken');
        expect(readableHexText('6177616B656E0000')).toBe('awaken');
    });

    it('keeps token punctuation and rejects odd, binary, and plain text', () => {
        expect(readableHexText(Buffer.from('a.b-c_d/e').toString('hex'))).toBe('a.b-c_d/e');
        expect(readableHexText('6177616B656')).toBeUndefined();
        expect(readableHexText('FF')).toBeUndefined();
        expect(readableHexText('awaken')).toBeUndefined();
        expect(readableHexText('00')).toBeUndefined();
    });
});
