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
    PermissionedDomain,
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
    | PermissionedDomain
    | DepositPreauth
    | MPTokenIssuance;
