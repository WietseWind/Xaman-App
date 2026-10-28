import Localize from '@locale';
import { describeDelegatePermission } from './delegatePermission';

export type PermissionIcon = 'IconSend' | 'IconRepeat' | 'IconFileText' | 'IconTrash' |
    'IconShield' | 'IconKey' | 'IconAlertTriangle' | 'IconCoins';

type Action = { labelKey: string; risk: string; icon: PermissionIcon };
const action = (labelKey: string, risk: string, icon: PermissionIcon): Action => ({ labelKey, risk, icon });

// Labels already have translations in every app locale. Never infer a new permission's meaning from its name.
const ACTIONS: Record<string, Action> = {
    Payment: action('global.payment', 'funds', 'IconSend'),
    OfferCreate: action('events.createOffer', 'trading', 'IconRepeat'),
    OfferCancel: action('events.cancelOffer', 'cancel', 'IconTrash'),
    CheckCreate: action('events.createCheck', 'funds', 'IconFileText'),
    CheckCash: action('events.cashCheck', 'reserves', 'IconCoins'),
    CheckCancel: action('events.cancelCheck', 'cancel', 'IconTrash'),
    EscrowCreate: action('events.createEscrow', 'funds', 'IconKey'),
    EscrowFinish: action('events.finishEscrow', 'escrow', 'IconKey'),
    EscrowCancel: action('events.cancelEscrow', 'cancel', 'IconTrash'),
    PaymentChannelCreate: action('events.createPaymentChannel', 'channel', 'IconSend'),
    PaymentChannelFund: action('events.fundPaymentChannel', 'channel', 'IconSend'),
    PaymentChannelClaim: action('events.claimPaymentChannel', 'channel', 'IconCoins'),
    TrustSet: action('events.updatedATrustLine', 'trust', 'IconShield'),
    DepositPreauth: action('events.authorizeDeposit', 'records', 'IconShield'),
    TicketCreate: action('events.createTicket', 'reserves', 'IconFileText'),
    NFTokenMint: action('events.mintNFT', 'nftCreate', 'IconFileText'),
    NFTokenBurn: action('events.burnNFT', 'nftBurn', 'IconTrash'),
    NFTokenModify: action('events.modifyNFT', 'metadata', 'IconFileText'),
    NFTokenCreateOffer: action('events.createNFTOffer', 'nftTrade', 'IconRepeat'),
    NFTokenAcceptOffer: action('events.acceptNFTOffer', 'nftTrade', 'IconRepeat'),
    NFTokenCancelOffer: action('events.cancelNFTOffer', 'cancel', 'IconTrash'),
    AMMCreate: action('events.ammCreate', 'pool', 'IconCoins'),
    AMMDelete: action('events.ammDelete', 'records', 'IconTrash'),
    AMMDeposit: action('events.ammDeposit', 'pool', 'IconCoins'),
    AMMWithdraw: action('events.ammWithdraw', 'pool', 'IconCoins'),
    AMMClawback: action('events.ammClawback', 'clawback', 'IconCoins'),
    AMMBid: action('events.ammBid', 'pool', 'IconCoins'),
    AMMVote: action('events.ammVote', 'pool', 'IconCoins'),
    Clawback: action('events.clawback', 'clawback', 'IconCoins'),
    MPTokenAuthorize: action('events.mpTokenAuthorize', 'issuedTokens', 'IconShield'),
    MPTokenIssuanceCreate: action('events.mpTokenIssuanceCreate', 'issuedTokens', 'IconFileText'),
    MPTokenIssuanceDestroy: action('mptokenIssuance.delete', 'issuedTokens', 'IconTrash'),
    MPTokenIssuanceSet: action('events.mpTokenIssuanceSet', 'issuedTokens', 'IconFileText'),
    CredentialAccept: action('events.credentialAccept', 'records', 'IconShield'),
    CredentialCreate: action('events.credentialCreate', 'records', 'IconShield'),
    CredentialDelete: action('events.credentialDelete', 'records', 'IconTrash'),
    DIDSet: action('events.didSet', 'metadata', 'IconFileText'),
    DIDDelete: action('events.didDelete', 'records', 'IconTrash'),
    OracleSet: action('events.oracleSet', 'metadata', 'IconFileText'),
    OracleDelete: action('events.oracleDelete', 'records', 'IconTrash'),
    PermissionedDomainSet: action('permissionedDomain.setTitleUpdate', 'records', 'IconShield'),
    PermissionedDomainDelete: action('permissionedDomain.remove', 'records', 'IconTrash'),
    ClaimReward: action('events.claimReward', 'rewards', 'IconCoins'),
    Remit: action('events.remit', 'funds', 'IconSend'),
    URITokenMint: action('events.mintURIToken', 'nftCreate', 'IconFileText'),
    URITokenBurn: action('events.burnURIToken', 'nftBurn', 'IconTrash'),
    URITokenBuy: action('events.buyURIToken', 'nftTrade', 'IconCoins'),
    URITokenCreateSellOffer: action('events.createURITokenSellOffer', 'nftTrade', 'IconRepeat'),
    URITokenCancelSellOffer: action('events.cancelURITokenSellOffer', 'cancel', 'IconTrash'),
    SetHook: action('events.setHooks', 'programs', 'IconFileText'),
    Invoke: action('events.invoke', 'programs', 'IconFileText'),
    Import: action('events.import', 'programs', 'IconFileText'),
    SetRemarks: action('events.setRemarks', 'metadata', 'IconFileText'),
    CronSet: action('events.cron', 'programs', 'IconFileText'),
    AccountSet: action('events.updateAccountSettings', 'control', 'IconKey'),
    AccountDelete: action('events.deleteAccount', 'control', 'IconTrash'),
    SetRegularKey: action('events.setRegularKey', 'control', 'IconKey'),
    SignerListSet: action('events.setSignerList', 'control', 'IconKey'),
    DelegateSet: action('txDelegateSet.objectLabel', 'control', 'IconKey'),
};

const GRANULAR = new Set(['TrustlineAuthorize', 'TrustlineFreeze', 'TrustlineUnfreeze', 'AccountDomainSet',
    'AccountEmailHashSet', 'AccountMessageKeySet', 'AccountTransferRateSet', 'AccountTickSizeSet',
    'PaymentMint', 'PaymentBurn', 'MPTokenIssuanceLock', 'MPTokenIssuanceUnlock']);

export type DelegationPermissionDetail = {
    name: string;
    action: string;
    explanation: string;
    risk: string;
    icon: PermissionIcon;
    unknown: boolean;
    critical: boolean;
};

const hasTranslation = (key: string): boolean => {
    const locale = Localize.getCurrentLocale();
    let value = Localize.instance.translations[locale];
    for (const part of key.split('.')) value = value?.[part];
    return typeof value === 'string' && !!value;
};

export const delegationPermissionDetail = (
    value: unknown,
    transactionTypes: Record<string, number>,
): DelegationPermissionDetail => {
    const valid = typeof value === 'string' || typeof value === 'number';
    const name = valid ? describeDelegatePermission(value, transactionTypes).label : String(value);
    const granular = GRANULAR.has(name);
    const known = Object.prototype.hasOwnProperty.call(ACTIONS, name) ? ACTIONS[name] : undefined;
    const detailKey = granular ? `delegation.granular.${name}` : `delegation.whole.${name}`;
    const supported = hasTranslation(detailKey) && (granular || (known && hasTranslation(known.labelKey) &&
        hasTranslation(`delegation.risks.${known.risk}`)));
    if (!valid || !supported) {
        return { name, action: name, explanation: Localize.t('delegation.unknownPermission'),
            risk: Localize.t('delegation.unknownRisk'), icon: 'IconAlertTriangle', unknown: true, critical: true };
    }
    const label = granular ? name : Localize.t(known!.labelKey);
    return { name, action: label,
        explanation: Localize.t(detailKey),
        risk: granular ? Localize.t(name === 'PaymentBurn' ? 'delegation.paymentBurnRisk' : 'delegation.granularRisk')
            : Localize.t(`delegation.risks.${known!.risk}`),
        icon: granular ? 'IconShield' : known!.icon, unknown: false,
        critical: granular ? ['PaymentMint', 'PaymentBurn'].includes(name)
            : ['funds', 'trading', 'nftBurn', 'nftTrade', 'control', 'programs'].includes(known!.risk) };
};

export const delegationPermissionValues = (permissions?: unknown[]): unknown[] =>
    (permissions || []).map((entry: any) => entry?.Permission?.PermissionValue ?? entry?.PermissionValue);

export const delegationDescription = (
    owner: string,
    authorize: string,
    permissions: unknown[],
    transactionTypes: Record<string, number>,
    mode: 'grant' | 'revoke' | 'object',
): string => {
    const lines = [
        Localize.t(mode === 'revoke' ? 'delegation.revokeExplanation' : 'delegation.explanation'),
        `${Localize.t('delegation.owner')}: ${owner}`,
        `${Localize.t('delegation.delegate')}: ${authorize}`,
    ];
    if (mode === 'revoke') return lines.join('\n\n');
    if (mode === 'grant') lines.push(Localize.t('delegation.replacesPermissions'));
    lines.push(Localize.t('delegation.wholeTransaction'));
    delegationPermissionValues(permissions).forEach(value => {
        const detail = delegationPermissionDetail(value, transactionTypes);
        lines.push(`${detail.name}\n${detail.explanation}\n${detail.risk}`);
    });
    return lines.join('\n\n');
};
