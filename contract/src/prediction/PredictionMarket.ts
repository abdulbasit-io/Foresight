import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    keccak256,
    OP_NET,
    Revert,
    SafeMath,
    StoredMapU256,
    StoredString,
    StoredU256,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import { EMPTY_POINTER } from '@btc-vision/btc-runtime/runtime/math/bytes';

// ═══════════════════════════════════════════════════════════
// PredictionMarket — Binary Parimutuel on Bitcoin L1 (OPNet)
// ═══════════════════════════════════════════════════════════
//
// Users stake wBTC (OP20) on YES or NO outcomes.
// A trusted resolver calls resolve() after endBlock.
// Winners claim a proportional share of the loser pool.
// If resolver misses the deadline, anyone can cancel and
// all stakers are fully refunded.
// ═══════════════════════════════════════════════════════════

// ── Global Storage Pointers (auto-assigned, starts at 1) ──
const marketCountPointer: u16 = Blockchain.nextPointer; // 1
const ownerPointer: u16 = Blockchain.nextPointer;       // 2
const feeBpsPointer: u16 = Blockchain.nextPointer;      // 3
const feeRecipientPointer: u16 = Blockchain.nextPointer;// 4
const accFeesPointer: u16 = Blockchain.nextPointer;     // 5 StoredMapU256
const yesStakesPointer: u16 = Blockchain.nextPointer;   // 6 StoredMapU256
const noStakesPointer: u16 = Blockchain.nextPointer;    // 7 StoredMapU256
const claimedPointer: u16 = Blockchain.nextPointer;     // 8 StoredMapU256
const questionPointer: u16 = Blockchain.nextPointer;    // 9 StoredString (indexed)
const descPointer: u16 = Blockchain.nextPointer;        // 10 StoredString (indexed)

// ── Per-Market Storage (pointer-offset, base 50) ──────────
// Market N uses pointers: 50 + N*12 to 50 + N*12 + 11
// Max markets: (65535 - 50) / 12 = 5457 markets
const MARKET_BASE_POINTER: u16 = 50;
const MARKET_SLOTS: u64 = 12;

// Field offsets within each market's slot block
const F_RESOLVER: u16 = 0;       // u256 (address as u256)
const F_PAYMENT_TOKEN: u16 = 1;  // u256 (address as u256)
const F_END_BLOCK: u16 = 2;      // u64 stored as u256
const F_RES_DEADLINE: u16 = 3;   // u64 stored as u256
const F_YES_POOL: u16 = 4;       // u256
const F_NO_POOL: u16 = 5;        // u256
const F_OUTCOME: u16 = 6;        // 0=OPEN, 1=YES, 2=NO, 3=CANCELLED
const F_FEE_BPS: u16 = 7;        // u16 stored as u256
const F_CREATOR: u16 = 8;        // u256 (address as u256)
const F_CREATED_AT: u16 = 9;     // u64 stored as u256
const F_FEE_AMOUNT: u16 = 10;    // u256 — fee earmarked at resolve time

// ── Outcome Constants ──────────────────────────────────────
const OUTCOME_OPEN: u256 = u256.Zero;
const OUTCOME_YES: u256 = u256.One;
const OUTCOME_NO: u256 = u256.fromU64(2);
const OUTCOME_CANCELLED: u256 = u256.fromU64(3);

// ── Platform Constants ─────────────────────────────────────
const DEFAULT_FEE_BPS: u256 = u256.fromU64(200); // 2%
const BASIS_POINTS: u256 = u256.fromU64(10000);
const SIDE_YES: u256 = u256.One;
const SIDE_NO: u256 = u256.fromU64(2);

@final
export class PredictionMarket extends OP_NET {
    private readonly marketCount: StoredU256;
    private readonly owner: StoredU256;
    private readonly feeBps: StoredU256;
    private readonly feeRecipient: StoredU256;
    private readonly accFees: StoredMapU256;
    private readonly yesStakes: StoredMapU256;
    private readonly noStakes: StoredMapU256;
    private readonly claimed: StoredMapU256;

    public constructor() {
        super();

        this.marketCount = new StoredU256(marketCountPointer, EMPTY_POINTER);
        this.owner = new StoredU256(ownerPointer, EMPTY_POINTER);
        this.feeBps = new StoredU256(feeBpsPointer, EMPTY_POINTER);
        this.feeRecipient = new StoredU256(feeRecipientPointer, EMPTY_POINTER);
        this.accFees = new StoredMapU256(accFeesPointer);
        this.yesStakes = new StoredMapU256(yesStakesPointer);
        this.noStakes = new StoredMapU256(noStakesPointer);
        this.claimed = new StoredMapU256(claimedPointer);
    }

    // ─── Deployment ────────────────────────────────────────
    public override onDeployment(_calldata: Calldata): void {
        const deployer = u256.fromUint8ArrayBE(Blockchain.tx.origin);
        this.owner.set(deployer);
        this.feeRecipient.set(deployer);
        this.feeBps.set(DEFAULT_FEE_BPS);
    }

    public override onUpdate(_calldata: Calldata): void {}

    // ─── Address Helpers ───────────────────────────────────
    // Reverse of u256.fromUint8ArrayBE: recover 32-byte address from stored u256
    private u256ToAddr(v: u256): Address {
        const buf = new Uint8Array(32);
        buf[0]  = u8(v.hi2 >> 56); buf[1]  = u8(v.hi2 >> 48); buf[2]  = u8(v.hi2 >> 40); buf[3]  = u8(v.hi2 >> 32);
        buf[4]  = u8(v.hi2 >> 24); buf[5]  = u8(v.hi2 >> 16); buf[6]  = u8(v.hi2 >> 8);  buf[7]  = u8(v.hi2);
        buf[8]  = u8(v.hi1 >> 56); buf[9]  = u8(v.hi1 >> 48); buf[10] = u8(v.hi1 >> 40); buf[11] = u8(v.hi1 >> 32);
        buf[12] = u8(v.hi1 >> 24); buf[13] = u8(v.hi1 >> 16); buf[14] = u8(v.hi1 >> 8);  buf[15] = u8(v.hi1);
        buf[16] = u8(v.lo2 >> 56); buf[17] = u8(v.lo2 >> 48); buf[18] = u8(v.lo2 >> 40); buf[19] = u8(v.lo2 >> 32);
        buf[20] = u8(v.lo2 >> 24); buf[21] = u8(v.lo2 >> 16); buf[22] = u8(v.lo2 >> 8);  buf[23] = u8(v.lo2);
        buf[24] = u8(v.lo1 >> 56); buf[25] = u8(v.lo1 >> 48); buf[26] = u8(v.lo1 >> 40); buf[27] = u8(v.lo1 >> 32);
        buf[28] = u8(v.lo1 >> 24); buf[29] = u8(v.lo1 >> 16); buf[30] = u8(v.lo1 >> 8);  buf[31] = u8(v.lo1);
        return changetype<Address>(buf);
    }

    // ─── Market Storage Helpers ────────────────────────────
    private marketPtr(marketId: u64, field: u16): u16 {
        return MARKET_BASE_POINTER + <u16>(marketId * MARKET_SLOTS) + field;
    }

    private setField(marketId: u64, field: u16, value: u256): void {
        const s = new StoredU256(this.marketPtr(marketId, field), EMPTY_POINTER);
        s.set(value);
    }

    private getField(marketId: u64, field: u16): u256 {
        const s = new StoredU256(this.marketPtr(marketId, field), EMPTY_POINTER);
        return s.value;
    }

    // ─── Composite Key for Per-User Stakes ────────────────
    // keccak256(marketId as 8 bytes || userAddress as 32 bytes) → u256 key
    private stakeKey(marketId: u64, user: Address): u256 {
        const buf = new BytesWriter(40);
        buf.writeU64(marketId);
        buf.writeAddress(user);
        return u256.fromUint8ArrayBE(keccak256(buf.getBuffer()));
    }

    // ─── createMarket ──────────────────────────────────────
    @method(
        { name: 'question', type: ABIDataTypes.STRING },
        { name: 'description', type: ABIDataTypes.STRING },
        { name: 'resolver', type: ABIDataTypes.ADDRESS },
        { name: 'paymentToken', type: ABIDataTypes.ADDRESS },
        { name: 'endBlock', type: ABIDataTypes.UINT256 },
        { name: 'resolutionDeadlineDelta', type: ABIDataTypes.UINT256 },
        { name: 'feeBpsOverride', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'marketId', type: ABIDataTypes.UINT256 })
    public createMarket(calldata: Calldata): BytesWriter {
        const question = calldata.readStringWithLength();
        const description = calldata.readStringWithLength();
        const resolver = u256.fromUint8ArrayBE(calldata.readAddress());
        const paymentToken = u256.fromUint8ArrayBE(calldata.readAddress());
        const endBlock = calldata.readU256();
        const resDelta = calldata.readU256();
        const feeBpsOverride = calldata.readU256();

        if (question.length === 0) throw new Revert('Question required');
        if (resolver.isZero()) throw new Revert('Resolver required');
        if (paymentToken.isZero()) throw new Revert('Payment token required');

        const currentBlock = u256.fromU64(Blockchain.block.number);
        if (u256.le(endBlock, currentBlock)) throw new Revert('endBlock must be in future');
        if (resDelta.isZero()) throw new Revert('Resolution deadline delta required');

        const marketId = this.marketCount.value.toU64();
        this.marketCount.set(SafeMath.add(this.marketCount.value, u256.One));

        const resDeadline = SafeMath.add(endBlock, resDelta);
        const creator = u256.fromUint8ArrayBE(Blockchain.tx.sender);
        const feeToUse = feeBpsOverride.isZero() ? this.feeBps.value : feeBpsOverride;

        this.setField(marketId, F_RESOLVER, resolver);
        this.setField(marketId, F_PAYMENT_TOKEN, paymentToken);
        this.setField(marketId, F_END_BLOCK, endBlock);
        this.setField(marketId, F_RES_DEADLINE, resDeadline);
        this.setField(marketId, F_YES_POOL, u256.Zero);
        this.setField(marketId, F_NO_POOL, u256.Zero);
        this.setField(marketId, F_OUTCOME, OUTCOME_OPEN);
        this.setField(marketId, F_FEE_BPS, feeToUse);
        this.setField(marketId, F_CREATOR, creator);
        this.setField(marketId, F_CREATED_AT, currentBlock);
        this.setField(marketId, F_FEE_AMOUNT, u256.Zero);

        // Store strings (indexed by marketId — each market gets its own slots)
        const qStore = new StoredString(questionPointer, marketId);
        qStore.value = question;
        const dStore = new StoredString(descPointer, marketId);
        dStore.value = description;

        const writer = new BytesWriter(32);
        writer.writeU256(u256.fromU64(marketId));
        return writer;
    }

    // ─── stake ─────────────────────────────────────────────
    @method(
        { name: 'marketId', type: ABIDataTypes.UINT256 },
        { name: 'side', type: ABIDataTypes.UINT256 },   // 1 = YES, 2 = NO
        { name: 'amount', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.UINT256 })
    public stake(calldata: Calldata): BytesWriter {
        const marketIdU256 = calldata.readU256();
        const side = calldata.readU256();
        const amount = calldata.readU256();

        if (amount.isZero()) throw new Revert('Amount must be > 0');

        const marketId = marketIdU256.toU64();
        const outcome = this.getField(marketId, F_OUTCOME);
        if (!u256.eq(outcome, OUTCOME_OPEN)) throw new Revert('Market not open');

        const endBlock = this.getField(marketId, F_END_BLOCK);
        const currentBlock = u256.fromU64(Blockchain.block.number);
        if (u256.ge(currentBlock, endBlock)) throw new Revert('Staking period ended');

        if (!u256.eq(side, SIDE_YES) && !u256.eq(side, SIDE_NO)) {
            throw new Revert('Side must be 1 (YES) or 2 (NO)');
        }

        const tokenAddr = this.u256ToAddr(this.getField(marketId, F_PAYMENT_TOKEN));
        const caller = Blockchain.tx.sender;

        // Pull tokens from user into contract escrow (requires prior approval)
        TransferHelper.transferFrom(tokenAddr, caller, Blockchain.contractAddress, amount);

        const key = this.stakeKey(marketId, caller);

        if (u256.eq(side, SIDE_YES)) {
            const cur = this.yesStakes.get(key);
            this.yesStakes.set(key, SafeMath.add(cur, amount));
            this.setField(marketId, F_YES_POOL, SafeMath.add(this.getField(marketId, F_YES_POOL), amount));
        } else {
            const cur = this.noStakes.get(key);
            this.noStakes.set(key, SafeMath.add(cur, amount));
            this.setField(marketId, F_NO_POOL, SafeMath.add(this.getField(marketId, F_NO_POOL), amount));
        }

        const writer = new BytesWriter(32);
        writer.writeU256(u256.One);
        return writer;
    }

    // ─── resolve ───────────────────────────────────────────
    @method(
        { name: 'marketId', type: ABIDataTypes.UINT256 },
        { name: 'outcome', type: ABIDataTypes.UINT256 }, // 1 = YES, 2 = NO
    )
    @returns({ name: 'success', type: ABIDataTypes.UINT256 })
    public resolve(calldata: Calldata): BytesWriter {
        const marketIdU256 = calldata.readU256();
        const newOutcome = calldata.readU256();
        const marketId = marketIdU256.toU64();

        // Only resolver can resolve
        const resolverHash = this.getField(marketId, F_RESOLVER);
        const callerHash = u256.fromUint8ArrayBE(Blockchain.tx.sender);
        if (!u256.eq(callerHash, resolverHash)) throw new Revert('Not resolver');

        // Market must be OPEN
        const currentOutcome = this.getField(marketId, F_OUTCOME);
        if (!u256.eq(currentOutcome, OUTCOME_OPEN)) throw new Revert('Market not open');

        // Can only resolve after endBlock
        const endBlock = this.getField(marketId, F_END_BLOCK);
        const currentBlock = u256.fromU64(Blockchain.block.number);
        if (u256.lt(currentBlock, endBlock)) throw new Revert('Staking period not ended');

        if (!u256.eq(newOutcome, OUTCOME_YES) && !u256.eq(newOutcome, OUTCOME_NO)) {
            throw new Revert('Outcome must be 1 (YES) or 2 (NO)');
        }

        this.setField(marketId, F_OUTCOME, newOutcome);

        // Pre-compute and earmark platform fee from total pool
        const yesPool = this.getField(marketId, F_YES_POOL);
        const noPool = this.getField(marketId, F_NO_POOL);
        const totalPool = SafeMath.add(yesPool, noPool);
        const feeBps = this.getField(marketId, F_FEE_BPS);
        const fee = SafeMath.div(SafeMath.mul(totalPool, feeBps), BASIS_POINTS);
        this.setField(marketId, F_FEE_AMOUNT, fee);

        // Accumulate fee per payment token for withdrawFees()
        if (!fee.isZero()) {
            const tokenKey = this.getField(marketId, F_PAYMENT_TOKEN);
            const accumulated = this.accFees.get(tokenKey);
            this.accFees.set(tokenKey, SafeMath.add(accumulated, fee));
        }

        const writer = new BytesWriter(32);
        writer.writeU256(u256.One);
        return writer;
    }

    // ─── cancel ────────────────────────────────────────────
    @method({ name: 'marketId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.UINT256 })
    public cancel(calldata: Calldata): BytesWriter {
        const marketId = calldata.readU256().toU64();

        const outcome = this.getField(marketId, F_OUTCOME);
        if (!u256.eq(outcome, OUTCOME_OPEN)) throw new Revert('Market not open');

        const callerHash = u256.fromUint8ArrayBE(Blockchain.tx.sender);
        const resolverHash = this.getField(marketId, F_RESOLVER);
        const isResolver = u256.eq(callerHash, resolverHash);

        if (!isResolver) {
            // Non-resolver can cancel only after resolution deadline has passed
            const resDeadline = this.getField(marketId, F_RES_DEADLINE);
            const currentBlock = u256.fromU64(Blockchain.block.number);
            if (u256.le(currentBlock, resDeadline)) throw new Revert('Deadline not passed');
        }

        this.setField(marketId, F_OUTCOME, OUTCOME_CANCELLED);

        const writer = new BytesWriter(32);
        writer.writeU256(u256.One);
        return writer;
    }

    // ─── claim ─────────────────────────────────────────────
    @method({ name: 'marketId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
    public claim(calldata: Calldata): BytesWriter {
        const marketId = calldata.readU256().toU64();
        const outcome = this.getField(marketId, F_OUTCOME);

        const caller = Blockchain.tx.sender;
        const key = this.stakeKey(marketId, caller);

        if (!this.claimed.get(key).isZero()) throw new Revert('Already claimed');

        let userStake: u256;
        let winningPool: u256;

        if (u256.eq(outcome, OUTCOME_YES)) {
            userStake = this.yesStakes.get(key);
            winningPool = this.getField(marketId, F_YES_POOL);
        } else if (u256.eq(outcome, OUTCOME_NO)) {
            userStake = this.noStakes.get(key);
            winningPool = this.getField(marketId, F_NO_POOL);
        } else {
            throw new Revert('Market not resolved');
        }

        if (userStake.isZero()) throw new Revert('No winning stake');
        if (winningPool.isZero()) throw new Revert('Invalid winning pool');

        const yesPool = this.getField(marketId, F_YES_POOL);
        const noPool = this.getField(marketId, F_NO_POOL);
        const totalPool = SafeMath.add(yesPool, noPool);
        const fee = this.getField(marketId, F_FEE_AMOUNT);
        const netPool = SafeMath.sub(totalPool, fee);

        // payout = userStake * netPool / winningPool
        const payout = SafeMath.div(SafeMath.mul(userStake, netPool), winningPool);

        this.claimed.set(key, u256.One);

        const tokenAddr = this.u256ToAddr(this.getField(marketId, F_PAYMENT_TOKEN));
        TransferHelper.transfer(tokenAddr, caller, payout);

        const writer = new BytesWriter(32);
        writer.writeU256(payout);
        return writer;
    }

    // ─── refund ────────────────────────────────────────────
    @method({ name: 'marketId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
    public refund(calldata: Calldata): BytesWriter {
        const marketId = calldata.readU256().toU64();

        const outcome = this.getField(marketId, F_OUTCOME);
        if (!u256.eq(outcome, OUTCOME_CANCELLED)) throw new Revert('Market not cancelled');

        const caller = Blockchain.tx.sender;
        const key = this.stakeKey(marketId, caller);

        if (!this.claimed.get(key).isZero()) throw new Revert('Already refunded');

        const yesStake = this.yesStakes.get(key);
        const noStake = this.noStakes.get(key);
        const total = SafeMath.add(yesStake, noStake);

        if (total.isZero()) throw new Revert('No stake to refund');

        this.claimed.set(key, u256.One);

        const tokenAddr = this.u256ToAddr(this.getField(marketId, F_PAYMENT_TOKEN));
        TransferHelper.transfer(tokenAddr, caller, total);

        const writer = new BytesWriter(32);
        writer.writeU256(total);
        return writer;
    }

    // ─── withdrawFees ──────────────────────────────────────
    @method({ name: 'token', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
    public withdrawFees(calldata: Calldata): BytesWriter {
        const tokenKey = u256.fromUint8ArrayBE(calldata.readAddress());

        const callerHash = u256.fromUint8ArrayBE(Blockchain.tx.sender);
        const ownerHash = this.owner.value;
        const recipientHash = this.feeRecipient.value;

        if (!u256.eq(callerHash, ownerHash) && !u256.eq(callerHash, recipientHash)) {
            throw new Revert('Not authorized');
        }

        const amount = this.accFees.get(tokenKey);
        if (amount.isZero()) throw new Revert('No fees to withdraw');

        this.accFees.set(tokenKey, u256.Zero);

        const tokenAddr = this.u256ToAddr(tokenKey);
        const recipient = this.u256ToAddr(recipientHash);
        TransferHelper.transfer(tokenAddr, recipient, amount);

        const writer = new BytesWriter(32);
        writer.writeU256(amount);
        return writer;
    }

    // ─── getMarket ─────────────────────────────────────────
    @method({ name: 'marketId', type: ABIDataTypes.UINT256 })
    @returns(
        { name: 'question', type: ABIDataTypes.STRING },
        { name: 'description', type: ABIDataTypes.STRING },
        { name: 'resolver', type: ABIDataTypes.UINT256 },
        { name: 'paymentToken', type: ABIDataTypes.UINT256 },
        { name: 'endBlock', type: ABIDataTypes.UINT256 },
        { name: 'resolutionDeadline', type: ABIDataTypes.UINT256 },
        { name: 'yesPool', type: ABIDataTypes.UINT256 },
        { name: 'noPool', type: ABIDataTypes.UINT256 },
        { name: 'outcome', type: ABIDataTypes.UINT256 },
        { name: 'feeBps', type: ABIDataTypes.UINT256 },
        { name: 'creator', type: ABIDataTypes.UINT256 },
        { name: 'createdAt', type: ABIDataTypes.UINT256 },
    )
    public getMarket(calldata: Calldata): BytesWriter {
        const marketId = calldata.readU256().toU64();

        const qStore = new StoredString(questionPointer, marketId);
        const dStore = new StoredString(descPointer, marketId);

        const writer = new BytesWriter(1024);
        writer.writeStringWithLength(qStore.value);
        writer.writeStringWithLength(dStore.value);
        writer.writeU256(this.getField(marketId, F_RESOLVER));
        writer.writeU256(this.getField(marketId, F_PAYMENT_TOKEN));
        writer.writeU256(this.getField(marketId, F_END_BLOCK));
        writer.writeU256(this.getField(marketId, F_RES_DEADLINE));
        writer.writeU256(this.getField(marketId, F_YES_POOL));
        writer.writeU256(this.getField(marketId, F_NO_POOL));
        writer.writeU256(this.getField(marketId, F_OUTCOME));
        writer.writeU256(this.getField(marketId, F_FEE_BPS));
        writer.writeU256(this.getField(marketId, F_CREATOR));
        writer.writeU256(this.getField(marketId, F_CREATED_AT));
        return writer;
    }

    // ─── getPosition ───────────────────────────────────────
    @method(
        { name: 'marketId', type: ABIDataTypes.UINT256 },
        { name: 'user', type: ABIDataTypes.ADDRESS },
    )
    @returns(
        { name: 'yesStake', type: ABIDataTypes.UINT256 },
        { name: 'noStake', type: ABIDataTypes.UINT256 },
        { name: 'hasClaimed', type: ABIDataTypes.UINT256 },
    )
    public getPosition(calldata: Calldata): BytesWriter {
        const marketId = calldata.readU256().toU64();
        const user = calldata.readAddress();
        const key = this.stakeKey(marketId, user);

        const writer = new BytesWriter(96);
        writer.writeU256(this.yesStakes.get(key));
        writer.writeU256(this.noStakes.get(key));
        writer.writeU256(this.claimed.get(key));
        return writer;
    }

    // ─── getOdds ───────────────────────────────────────────
    @method({ name: 'marketId', type: ABIDataTypes.UINT256 })
    @returns(
        { name: 'yesPool', type: ABIDataTypes.UINT256 },
        { name: 'noPool', type: ABIDataTypes.UINT256 },
        { name: 'yesPercent', type: ABIDataTypes.UINT256 }, // 0–10000 basis points
    )
    public getOdds(calldata: Calldata): BytesWriter {
        const marketId = calldata.readU256().toU64();
        const yesPool = this.getField(marketId, F_YES_POOL);
        const noPool = this.getField(marketId, F_NO_POOL);
        const total = SafeMath.add(yesPool, noPool);

        let yesPercent: u256 = u256.Zero;
        if (!total.isZero()) {
            yesPercent = SafeMath.div(SafeMath.mul(yesPool, BASIS_POINTS), total);
        }

        const writer = new BytesWriter(96);
        writer.writeU256(yesPool);
        writer.writeU256(noPool);
        writer.writeU256(yesPercent);
        return writer;
    }

    // ─── getMarketCount ────────────────────────────────────
    @method()
    @returns({ name: 'count', type: ABIDataTypes.UINT256 })
    public getMarketCount(_: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeU256(this.marketCount.value);
        return writer;
    }
}
