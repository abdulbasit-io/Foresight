import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the createMarket function call.
 */
export type CreateMarket = CallResult<
    {
        marketId: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the stake function call.
 */
export type Stake = CallResult<
    {
        success: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the resolve function call.
 */
export type Resolve = CallResult<
    {
        success: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the cancel function call.
 */
export type Cancel = CallResult<
    {
        success: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the claim function call.
 */
export type Claim = CallResult<
    {
        amount: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the refund function call.
 */
export type Refund = CallResult<
    {
        amount: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the withdrawFees function call.
 */
export type WithdrawFees = CallResult<
    {
        amount: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getMarket function call.
 */
export type GetMarket = CallResult<
    {
        question: string;
        description: string;
        resolver: bigint;
        paymentToken: bigint;
        endBlock: bigint;
        resolutionDeadline: bigint;
        yesPool: bigint;
        noPool: bigint;
        outcome: bigint;
        feeBps: bigint;
        creator: bigint;
        createdAt: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getPosition function call.
 */
export type GetPosition = CallResult<
    {
        yesStake: bigint;
        noStake: bigint;
        hasClaimed: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getOdds function call.
 */
export type GetOdds = CallResult<
    {
        yesPool: bigint;
        noPool: bigint;
        yesPercent: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getMarketCount function call.
 */
export type GetMarketCount = CallResult<
    {
        count: bigint;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// IPredictionMarket
// ------------------------------------------------------------------
export interface IPredictionMarket extends IOP_NETContract {
    createMarket(
        question: string,
        description: string,
        resolver: Address,
        paymentToken: Address,
        endBlock: bigint,
        resolutionDeadlineDelta: bigint,
        feeBpsOverride: bigint,
    ): Promise<CreateMarket>;
    stake(marketId: bigint, side: bigint, amount: bigint): Promise<Stake>;
    resolve(marketId: bigint, outcome: bigint): Promise<Resolve>;
    cancel(marketId: bigint): Promise<Cancel>;
    claim(marketId: bigint): Promise<Claim>;
    refund(marketId: bigint): Promise<Refund>;
    withdrawFees(token: Address): Promise<WithdrawFees>;
    getMarket(marketId: bigint): Promise<GetMarket>;
    getPosition(marketId: bigint, user: Address): Promise<GetPosition>;
    getOdds(marketId: bigint): Promise<GetOdds>;
    getMarketCount(): Promise<GetMarketCount>;
}
