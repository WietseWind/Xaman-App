/**
 * Readable text hidden in a hex extra-field value.
 * Same idea as the currency-code decoder: even-length hex, UTF-8, no nulls or
 * replacement characters, and only the token-name character set.
 */
const READABLE = /^[A-Za-z0-9 .,_+\-/*^()[\]:;!?]+$/;

export const readableHexText = (value: string): string | undefined => {
    if (!/^[0-9a-fA-F]+$/.test(value) || value.length < 2 || value.length % 2 !== 0) {
        return undefined;
    }
    const bytes = Buffer.from(value, 'hex');
    const decoded = bytes.toString('utf8');
    if (decoded.includes('\uFFFD') || !Buffer.from(decoded, 'utf8').equals(bytes)) {
        return undefined;
    }
    const text = decoded.replace(/\0/g, '').replace(/(\r\n|\n|\r)/g, ' ').trim();
    if (!text || !READABLE.test(text)) {
        return undefined;
    }
    return text;
};
