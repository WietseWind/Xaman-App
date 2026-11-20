/**
 * What a Remit carries, as a list to review one by one.
 *
 * A Remit (Xahau) can send up to 32 amounts, transfer up to 32 URITokens and mint one URIToken
 * for the destination, all in one transaction. The review shows each of them as a block of its
 * own, in the order of the transaction: amounts, URITokens to transfer, the URIToken to mint.
 */
import { Remit } from '@common/libs/ledger/transactions';
import { AmountType } from '@common/libs/ledger/parser/types';

import { readableHexText } from '../../extraFieldText';

// MintURIToken.Flags: the issuer may destroy the URIToken (its owner always can)
const tfBurnable = 0x00000001;

export type RemitContent =
    | { kind: 'amount'; key: string; amount: AmountType }
    | { kind: 'uritoken'; key: string; id: string }
    | {
          kind: 'mint';
          key: string;
          /** the URI as the transaction has it (hex) */
          uri?: string;
          /** the URI as text, when its bytes are readable text */
          uriText?: string;
          digest?: string;
          burnable: boolean;
          /** flags that this screen does not explain, as a number; undefined when there are none */
          otherFlags?: number;
      };

const asNumber = (value: unknown): number => {
    const number = typeof value === 'string' ? Number(value) : value;
    return typeof number === 'number' && Number.isFinite(number) ? number : 0;
};

/**
 * A URI is text in hex. `readableHexText` knows the characters of a token name; a URI has more
 * (`%`, `=`, `&`, `#`, `@`, `~`, `'`, `$`), so those are accepted here too. Bytes that are not
 * valid UTF-8, or control characters, are not shown as text.
 */
export const readableUri = (hex: string): string | undefined => {
    const simple = readableHexText(hex);
    if (simple) return simple;
    if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length < 2 || hex.length % 2 !== 0) return undefined;
    const bytes = Buffer.from(hex, 'hex');
    const text = bytes.toString('utf8');
    if (text.includes('\uFFFD') || !Buffer.from(text, 'utf8').equals(bytes)) return undefined;
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001F\u007F]/.test(text) || !text.trim()) return undefined;
    return text.trim();
};

export const remitContents = (transaction: Remit): RemitContent[] => {
    const contents: RemitContent[] = [];

    (transaction.Amounts || []).forEach((amount, index) => {
        contents.push({ kind: 'amount', key: `amount-${index}`, amount });
    });

    (transaction.URITokenIDs || []).forEach((entry: any, index: number) => {
        const id = typeof entry === 'string' ? entry : entry?.URITokenID;
        if (typeof id === 'string' && id.length > 0) {
            contents.push({ kind: 'uritoken', key: `uritoken-${index}`, id });
        }
    });

    const mint = transaction.MintURIToken as Record<string, unknown> | undefined;
    if (mint && typeof mint === 'object') {
        const uri = typeof mint.URI === 'string' ? mint.URI : undefined;
        const flags = asNumber(mint.Flags);
        // eslint-disable-next-line no-bitwise
        const otherFlags = flags & ~tfBurnable;
        contents.push({
            kind: 'mint',
            key: 'mint',
            uri,
            uriText: uri ? readableUri(uri) : undefined,
            digest: typeof mint.Digest === 'string' ? mint.Digest : undefined,
            // eslint-disable-next-line no-bitwise
            burnable: (flags & tfBurnable) === tfBurnable,
            otherFlags: otherFlags !== 0 ? otherFlags : undefined,
        });
    }

    return contents;
};
