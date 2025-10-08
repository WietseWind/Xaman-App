import {
    Offer,
    Escrow,
    Check,
    Ticket,
    PayChannel,
    NFTokenOffer,
    URIToken,
    Delegate,
    Credential,
    MPToken,
    MPTokenIssuance,
    DepositPreauth,
} from '.';

export type LedgerObjects =
    | Offer
    | Escrow
    | Check
    | Ticket
    | PayChannel
    | NFTokenOffer
    | URIToken
    | Delegate
    | Credential
    | MPToken
    | DepositPreauth
    | MPTokenIssuance;
