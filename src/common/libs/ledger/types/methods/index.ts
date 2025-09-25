import { AccountChannelsRequest, AccountChannelsResponse, Channel } from './accountChannels';
import { AccountCurrenciesRequest, AccountCurrenciesResponse } from './accountCurrencies';
import { AccountInfoRequest, AccountInfoResponse, AccountQueueData, AccountQueueTransaction } from './accountInfo';
import { AccountLinesRequest, AccountLinesResponse, AccountLinesTrustline } from './accountLines';
import { AccountNFToken, AccountNFTsRequest, AccountNFTsResponse } from './accountNFTs';
import { AccountObject, AccountObjectsRequest, AccountObjectsResponse, AccountObjectType } from './accountObjects';
import { AccountOffer, AccountOffersRequest, AccountOffersResponse } from './accountOffers';
import { AccountTxRequest, AccountTxResponse, AccountTxTransaction } from './accountTx';
import { AMMInfoRequest, AMMInfoResponse } from './ammInfo';
import { BaseRequest, BaseResponse, ErrorResponse, ResponseWarning } from './baseMethod';
import { BookOffersRequest, BookOffer, BookOffersResponse, BookOfferCurrency } from './bookOffers';
import { ChannelVerifyRequest, ChannelVerifyResponse } from './channelVerify';
import { DepositAuthorizedRequest, DepositAuthorizedResponse } from './depositAuthorized';
import { FeeRequest, FeeResponse } from './fee';
import { GatewayBalance, GatewayBalancesRequest, GatewayBalancesResponse } from './gatewayBalances';
import {
    LedgerBinary,
    LedgerModifiedOfferCreateTransaction,
    LedgerQueueData,
    LedgerRequest,
    LedgerResponse,
} from './ledger';
import { LedgerClosedRequest, LedgerClosedResponse } from './ledgerClosed';
import { LedgerCurrentRequest, LedgerCurrentResponse } from './ledgerCurrent';
import {
    LedgerDataBinaryLedgerEntry,
    LedgerDataLabeledLedgerEntry,
    LedgerDataLedgerState,
    LedgerDataRequest,
    LedgerDataResponse,
} from './ledgerData';
import { LedgerEntryRequest, LedgerEntryResponse } from './ledgerEntry';
import { ManifestRequest, ManifestResponse } from './manifest';
import { NFTBuyOffersRequest, NFTBuyOffersResponse } from './nftBuyOffers';
import { NFTSellOffersRequest, NFTSellOffersResponse } from './nftSellOffers';
import { NoRippleCheckRequest, NoRippleCheckResponse } from './norippleCheck';
import {
    PathFindRequest,
    PathFindCloseRequest,
    PathFindCreateRequest,
    PathFindStatusRequest,
    PathFindResponse,
    PathFindPathOption,
} from './pathFind';
import { PingRequest, PingResponse } from './ping';
import { RandomRequest, RandomResponse } from './random';
import { ServerDefinitionsRequest, ServerDefinitionsResponse } from './serverDefinitions';
import {
    JobType,
    ServerInfoRequest,
    ServerInfoResponse,
    ServerState,
    StateAccounting,
    StateAccountingFinal,
} from './serverInfo';
import { ServerStateRequest, ServerStateResponse } from './serverState';
import { SimulateRequest, SubmitRequest, SubmitResponse } from './submit';
import { SubmitMultisignedRequest, SubmitMultisignedResponse } from './submitMultisigned';
import {
    BooksSnapshot,
    ConsensusStream,
    LedgerStream,
    LedgerStreamResponse,
    OrderBookStream,
    PathFindStream,
    PeerStatusStream,
    Stream,
    SubscribeBook,
    SubscribeRequest,
    SubscribeResponse,
    TransactionStream,
    ValidationStream,
} from './subscribe';
import { TransactionEntryRequest, TransactionEntryResponse } from './transactionEntry';
import { TxRequest, TxResponse } from './tx';
import { UnsubscribeBook, UnsubscribeRequest, UnsubscribeResponse } from './unsubscribe';
/**
 * @category Requests
 */
type Request =
    // account methods
    | AccountChannelsRequest
    | AccountCurrenciesRequest
    | AccountInfoRequest
    | AccountLinesRequest
    | AccountNFTsRequest
    | AccountObjectsRequest
    | AccountOffersRequest
    | AccountTxRequest
    | GatewayBalancesRequest
    | NoRippleCheckRequest
    // ledger methods
    | LedgerRequest
    | LedgerClosedRequest
    | LedgerCurrentRequest
    | LedgerDataRequest
    | LedgerEntryRequest
    // transaction methods
    | SubmitRequest
    | SimulateRequest
    | SubmitMultisignedRequest
    | TransactionEntryRequest
    | TxRequest
    // path and order book methods
    | BookOffersRequest
    | DepositAuthorizedRequest
    | PathFindRequest
    // payment channel methods
    | ChannelVerifyRequest
    // subscription methods
    | SubscribeRequest
    | UnsubscribeRequest
    // server info methods
    | FeeRequest
    | ManifestRequest
    | ServerDefinitionsRequest
    | ServerInfoRequest
    | ServerStateRequest
    // utility methods
    | PingRequest
    | RandomRequest
    // NFT methods
    | NFTBuyOffersRequest
    | NFTSellOffersRequest
    // AMM methods
    | AMMInfoRequest;

/**
 * @category Responses
 */
type Response =
    // account methods
    | AccountChannelsResponse
    | AccountCurrenciesResponse
    | AccountInfoResponse
    | AccountLinesResponse
    | AccountNFTsResponse
    | AccountObjectsResponse
    | AccountOffersResponse
    | AccountTxResponse
    | GatewayBalancesResponse
    | NoRippleCheckResponse
    // ledger methods
    | LedgerResponse
    | LedgerClosedResponse
    | LedgerCurrentResponse
    | LedgerDataResponse
    | LedgerEntryResponse
    // transaction methods
    | SubmitResponse
    | SubmitMultisignedResponse
    | TransactionEntryResponse
    | TxResponse
    // path and order book methods
    | BookOffersResponse
    | DepositAuthorizedResponse
    | PathFindResponse
    // payment channel methods
    | ChannelVerifyResponse
    // subscription methods
    | SubscribeResponse
    | UnsubscribeResponse
    // server info methods
    | FeeResponse
    | ManifestResponse
    | ServerDefinitionsResponse
    | ServerInfoResponse
    | ServerStateResponse
    // utility methods
    | PingResponse
    | RandomResponse
    // NFT methods
    | NFTBuyOffersResponse
    | NFTSellOffersResponse
    // AMM methods
    | AMMInfoResponse;

export type {
    BaseRequest,
    BaseResponse,
    Request,
    Response,
    ResponseWarning,
    // account methods with types
    Channel,
    AccountChannelsRequest,
    AccountChannelsResponse,
    AccountCurrenciesRequest,
    AccountCurrenciesResponse,
    AccountInfoRequest,
    AccountInfoResponse,
    AccountQueueData,
    AccountQueueTransaction,
    AccountLinesRequest,
    AccountLinesResponse,
    AccountLinesTrustline,
    AccountNFToken,
    AccountNFTsRequest,
    AccountNFTsResponse,
    AccountObject,
    AccountObjectType,
    AccountObjectsRequest,
    AccountObjectsResponse,
    AccountOffer,
    AccountOffersRequest,
    AccountOffersResponse,
    AccountTxRequest,
    AccountTxResponse,
    AccountTxTransaction,
    GatewayBalance,
    GatewayBalancesRequest,
    GatewayBalancesResponse,
    NoRippleCheckRequest,
    NoRippleCheckResponse,
    // ledger methods
    LedgerRequest,
    LedgerResponse,
    LedgerQueueData,
    LedgerBinary,
    LedgerModifiedOfferCreateTransaction,
    LedgerClosedRequest,
    LedgerClosedResponse,
    LedgerCurrentRequest,
    LedgerCurrentResponse,
    LedgerDataRequest,
    LedgerDataLabeledLedgerEntry,
    LedgerDataBinaryLedgerEntry,
    LedgerDataResponse,
    LedgerDataLedgerState,
    LedgerEntryRequest,
    LedgerEntryResponse,
    // transaction methods with types
    SimulateRequest,
    SubmitRequest,
    SubmitResponse,
    SubmitMultisignedRequest,
    SubmitMultisignedResponse,
    TransactionEntryRequest,
    TransactionEntryResponse,
    TxRequest,
    TxResponse,
    // path and order book methods with types
    BookOffersRequest,
    BookOffer,
    BookOfferCurrency,
    BookOffersResponse,
    DepositAuthorizedRequest,
    DepositAuthorizedResponse,
    PathFindRequest,
    PathFindCreateRequest,
    PathFindCloseRequest,
    PathFindPathOption,
    PathFindStatusRequest,
    PathFindResponse,
    // payment channel methods
    ChannelVerifyRequest,
    ChannelVerifyResponse,
    // Subscribe methods/streams with types
    SubscribeRequest,
    SubscribeResponse,
    SubscribeBook,
    Stream,
    BooksSnapshot,
    LedgerStream,
    LedgerStreamResponse,
    ValidationStream,
    TransactionStream,
    PathFindStream,
    PeerStatusStream,
    OrderBookStream,
    ConsensusStream,
    UnsubscribeRequest,
    UnsubscribeResponse,
    UnsubscribeBook,
    // server info methods with types
    FeeRequest,
    FeeResponse,
    ManifestRequest,
    ManifestResponse,
    ServerDefinitionsRequest,
    ServerDefinitionsResponse,
    ServerInfoRequest,
    ServerInfoResponse,
    ServerStateRequest,
    ServerStateResponse,
    JobType,
    ServerState,
    StateAccountingFinal,
    StateAccounting,
    // utility methods
    PingRequest,
    PingResponse,
    RandomRequest,
    RandomResponse,
    ErrorResponse,
    // NFT methods
    NFTBuyOffersRequest,
    NFTBuyOffersResponse,
    NFTSellOffersRequest,
    NFTSellOffersResponse,
    // AMM methods
    AMMInfoRequest,
    AMMInfoResponse,
};
