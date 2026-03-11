# Prediction Market on OPNet

## Overview

A binary prediction market where users stake wrapped BTC (wBTC OP20) on YES/NO outcomes. An oracle resolves each market on-chain. Winners claim a proportional share of the loser pool. No backend required — all state lives on-chain via OPNet.

Think Polymarket, but on Bitcoin L1 — with bets denominated in BTC.

---

## Currency: Wrapped BTC (not stables, not HODL)

OPNet contracts cannot hold **native BTC** directly. However, OPNet has a native wrapped BTC OP20 token. When a user receives testnet BTC from the faucet, they wrap it into wBTC (an OP20) which the contract can hold in escrow.

This is better than using an arbitrary token like HODL because:
- It uses BTC — the natural asset for Bitcoin-native users
- Faucet BTC is immediately usable after a single wrap step
- All market volumes and odds are denominated in real BTC
- No need to acquire a separate token

**UI flow**: Faucet BTC → wrap to wBTC (one transaction via OPNet wrap contract) → approve wBTC to prediction market → stake

The `paymentToken` field in every market points to the canonical wBTC OP20 contract address. Market creators can override this to any OP20 (e.g. for community tokens), but the default is wBTC.

---

## Critical Constraints (OPNet-Specific)

| Constraint | Impact on design |
|---|---|
| No external HTTP calls from contracts | Oracles must **push** outcomes in via a transaction — no pull |
| No timestamps | All timing uses Bitcoin block numbers (144 blocks ≈ 1 day) |
| Contracts CAN hold OP20 tokens | wBTC stakes are held safely in contract escrow |
| No native BTC custody | Wrap faucet BTC to wBTC (OP20) first — one transaction |
| Partial reverts | Only OPNet state reverts; OP20 transfers inside the VM are atomic |
| AssemblyScript only | All contract logic in AS — no Solidity, no EVM |
| StoredMap / StoredValue only | Plain AS `Map<>` is not persistent — must use OPNet storage primitives |
| No IPFS from contracts | All on-chain data is strings; long descriptions stored as on-chain fields |

---

## Market Model: Parimutuel

Three models exist. Parimutuel is the right call for MVP.

| Model | How it works | Complexity |
|---|---|---|
| **Parimutuel** | All stakes pooled; winners share loser pool proportionally | Low |
| LMSR (algo market maker) | Contract provides liquidity at algorithmic prices | High |
| Order book | Limit orders matched on YES/NO shares | Very High |

Parimutuel is how horse racing, early Augur, and most simple prediction markets work. It's correct, fair, and straightforward to implement and audit.

### Payout Formula

```
Total pool     = YES pool + NO pool
Winner payout  = (user stake / total winning pool) × total pool × (1 - feeBps/10000)
Platform fee   = total pool × feeBps / 10000
```

Example: User stakes 0.01 wBTC on YES. YES pool = 0.04 wBTC, NO pool = 0.06 wBTC. Total = 0.1 wBTC.
If YES wins: payout = (0.01/0.04) × 0.1 × 0.98 = 0.0245 wBTC. (Net profit: +0.0145 wBTC on 0.01 staked.)

The odds are implicit and live: current YES price = YES pool / total pool. As more stakes come in, the implied probability updates in real time.

---

## Oracle Model

OPNet contracts cannot fetch external data. Oracles must be pushed on-chain.

### MVP: Trusted Resolver (Per Market)

Each market designates a resolver address at creation. The resolver calls `resolve(marketId, outcome)` after the end block. Simple, honest about the trust model.

Trust mitigation in MVP:
- **Reputation** — resolver's address is public and on-chain. Bad resolution = permanently visible
- **Auto-cancel** — if resolver doesn't resolve within `endBlock + resolutionDeadlineDelta`, anyone can call `cancel()` and all stakers are refunded. This caps the downside of a rogue or inactive resolver.

**Phase 1**: Single trusted resolver + auto-cancel safety net.
**Phase 2**: Multi-sig resolver (M-of-N) — contract `MultiSigResolver.ts` counts votes, finalises when threshold met.
**Phase 3**: Optimistic dispute window.

---

## Market Lifecycle

```
              ┌─────────────────────────────────────────────────┐
              │                   OPEN                          │
              │  Users stake YES/NO freely                      │
              │  Odds update in real time                       │
              └────────────────┬────────────────────────────────┘
                               │ endBlock reached
                     ┌─────────▼──────────────┐
                     │  AWAITING RESOLUTION   │
                     │  No new stakes allowed  │
                     └──────┬────────┬─────────┘
          resolver calls    │        │  resolutionDeadline passes
          resolve()         │        │  without resolution
                   ┌────────▼──┐  ┌──▼──────────┐
                   │ RESOLVED  │  │  CANCELLED  │
                   │ YES or NO │  │  Full refund│
                   └────────┬──┘  └─────────────┘
                            │ users call claim()
                   ┌────────▼──┐
                   │  CLOSED   │
                   │ All paid  │
                   └───────────┘
```

State enum: `0 = OPEN | 1 = AWAITING | 2 = RESOLVED_YES | 3 = RESOLVED_NO | 4 = CANCELLED`

---

## Contract Architecture

### `PredictionMarket.ts` (AssemblyScript)

Single contract. All markets live inside it. No per-market contract deployment.

#### Storage (OPNet primitives only — no plain AS Map)

```typescript
// Market registry
marketCount:    StoredU256               // auto-incrementing market ID

// Per-market config — serialised struct stored in a StoredMap keyed by marketId
markets:        StoredMap<u256, Bytes>   // marketId → serialised Market struct

// Per-market user positions
// Keys: concat(marketId, userAddress) → u256
yesStakes:      StoredMap<Bytes, u256>
noStakes:       StoredMap<Bytes, u256>
claimed:        StoredMap<Bytes, bool>

// Platform
owner:          StoredAddress
feeBps:         StoredU16               // default platform fee (e.g. 200 = 2%)
feeRecipient:   StoredAddress
accumulatedFees: StoredMap<Address, u256>  // paymentToken → fees owed
```

#### Market Struct

```typescript
class Market {
    question:            string    // the market question (stored on-chain)
    description:         string    // resolution criteria (stored on-chain, keep concise)
    resolver:            Address   // who can resolve
    paymentToken:        Address   // OP20 used for staking (default: wBTC)
    endBlock:            u64       // staking closes here
    resolutionDeadline:  u64       // absolute block — resolver must resolve by this
    yesPool:             u256      // total YES stakes
    noPool:              u256      // total NO stakes
    outcome:             u8        // 0=open, 1=yes, 2=no, 3=cancelled
    feeBps:              u16       // per-market fee (0 = use platform default)
    creator:             Address
    createdAtBlock:      u64
}
```

#### Methods

| Method | Who can call | What it does |
|---|---|---|
| `createMarket(question, description, resolver, paymentToken, endBlock, resolutionDeadlineDelta, feeBps)` | Anyone | Creates a new market |
| `stake(marketId, side, amount)` | Anyone | Stakes wBTC on YES (side=1) or NO (side=2). Requires prior OP20 approval |
| `resolve(marketId, outcome)` | Resolver only | Finalises market outcome (YES or NO). Only callable after endBlock |
| `cancel(marketId)` | Anyone after deadline | Cancels market if resolver missed the deadline. Enables refunds |
| `claim(marketId)` | Winners only | Claims proportional payout after resolution |
| `refund(marketId)` | All stakers | Returns full stake after cancellation |
| `withdrawFees(token)` | Owner / feeRecipient | Withdraws accumulated platform fees |
| `getMarket(marketId)` | Anyone (read) | Returns full market struct |
| `getPosition(marketId, user)` | Anyone (read) | Returns user's YES and NO stakes |
| `getOdds(marketId)` | Anyone (read) | Returns YES pool, NO pool, implied probability (basis points) |

#### Key Logic Notes

- `stake()` calls `paymentToken.transferFrom(caller, contractAddress, amount)` — requires prior OP20 approval
- `resolve()` only callable by `market.resolver` and only when `block >= market.endBlock`
- `cancel()` callable by anyone when `block > market.resolutionDeadline` and market is still AWAITING
- `claim()` verifies `outcome == RESOLVED_YES && yesStakes[key] > 0 && !claimed[key]`, transfers payout, marks claimed
- Fee is deducted from **total pool before payout** — losers effectively pay the fee, winners receive net
- `resolutionDeadline = endBlock + resolutionDeadlineDelta` (e.g. + 144 blocks = ~1 day grace period)
- All u256 arithmetic uses OPNet's safe math — no overflow risk

---

## Frontend (4 pages, MVP scope)

### Pages

```
/markets          → Browse all open markets (cards with odds, volume, blocks remaining)
/markets/:id      → Market detail + stake UI + claim/refund
/create           → Create new market
/portfolio        → All markets where wallet has stakes (pending, claimable, refundable)
```

### Market Card (Browse)

- Question text
- Current odds (YES% / NO%) bar — live from chain
- Total volume in wBTC
- Blocks remaining → approx time shown as "~N days"
- Status tag: OPEN / AWAITING RESOLUTION / RESOLVED YES / RESOLVED NO / CANCELLED

### Market Detail

- Question + description
- Live odds bar (YES% green, NO% red)
- Total pool breakdown (YES pool / NO pool / total)
- "Stake YES" / "Stake NO" — amount input, shows estimated payout at current odds
- Two-step button: Approve wBTC → Stake (collapsed into one UX flow)
- Resolver address + resolution deadline block
- If RESOLVED: outcome banner + Claim button (if winner)
- If CANCELLED: Refund button (if staked)
- If AWAITING and caller is resolver: Resolve YES / Resolve NO buttons

### Create Market

Form fields:
- Question (string, required)
- Description / resolution criteria (string, required — stored on-chain)
- Payment token (defaults to wBTC address, editable)
- End block (numeric input with helper: "current block + N = ~N days")
- Resolution deadline delta (blocks after end, e.g. 144 = 1 day)
- Resolver address (defaults to connected wallet)
- Fee bps (optional, 0 = platform default)

### Portfolio

- Lists all positions from on-chain events (staked, claimable, refundable)
- Claim All / Refund All batch actions

---

## Fee Model (MVP: one fee, kept simple)

| Fee | Amount | Recipient |
|---|---|---|
| Platform fee | 2% of total pool at resolution | Protocol treasury (feeRecipient) |

Resolver fees and creator fees are Phase 2. Phase 1 keeps one fee accumulator, one withdraw path. Less surface area, less to audit.

---

## Seeded Markets (Testnet Launch)

Deploy 5 markets at launch to demonstrate the product:

| Question | End Block | Resolver |
|---|---|---|
| Will BTC close above $100k at block 900,000? | 900,000 | Protocol wallet |
| Will BTC close above $150k at block 950,000? | 950,000 | Protocol wallet |
| Will OPNet testnet reach 1M total transactions? | current+1000 | Protocol wallet |
| Will the next Bitcoin halving occur before block 1,050,000? | 1,050,000 | Protocol wallet |
| Will BTC dominance stay above 50% until block 910,000? | 910,000 | Protocol wallet |

These seed real activity, demonstrate the full lifecycle, and give users something meaningful to stake on at launch.

---

## Build Order

### Phase 1 (MVP — end to end)

1. `PredictionMarket.ts` — createMarket, stake, resolve, cancel, claim, refund, withdrawFees, view methods
2. Unit tests for all state transitions
3. Deploy on OPNet testnet with wBTC as default payment token
4. Seed 5 markets via deploy script
5. Frontend: /markets, /markets/:id (stake + claim + refund), /create, /portfolio
6. Connect OPWallet, read contract state, send transactions

### Phase 2

1. `MultiSigResolver.ts` — M-of-N resolver contract
2. Resolver fee + creator fee split
3. Open market creation to public
4. Odds history chart from stake events

### Phase 3

1. Optimistic dispute window (counter-resolver override)
2. Categorical markets (multiple outcomes)
3. Creator analytics dashboard

---

## Out of Scope

| Feature | Reason |
|---|---|
| Continuous/scalar markets | Requires LMSR or order book |
| Automated trustless oracle | Requires UMA-style dispute game |
| Liquidity mining | Needs reward token distribution |
| Leveraged positions | Risk model too complex |
| IPFS for descriptions | External dependency, adds complexity — on-chain strings are sufficient for MVP |

---

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Resolver resolves incorrectly | High | Auto-cancel after deadline; multi-sig in Phase 2; address is permanently on-chain |
| Thin liquidity | Medium | Protocol seeds 5 markets with treasury wBTC |
| Block time variance | Low | Use blocks, not time. Bitcoin culture understands this |
| wBTC wrap UX friction | Low | UI guides user through wrap → approve → stake in one flow |
| Front-running | Low | OPNet consensus ordering; no MEV equivalent on Bitcoin L1 |

---

## Competitive Position

| Platform | Settlement | Oracle | Payment | Status |
|---|---|---|---|---|
| Polymarket | Polygon (EVM) | UMA (optimistic) | USDC | Live, large |
| Augur | Ethereum | REP token holders | ETH/DAI | Declining |
| **This** | Bitcoin L1 (OPNet) | Trusted resolver → multi-sig | wBTC (native) | First on Bitcoin |

The moat is **Bitcoin L1 settlement + BTC-denominated bets**. No other prediction market settles on Bitcoin's proof-of-work with BTC as the staking currency.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Smart contracts | AssemblyScript → WASM (OPNet runtime) |
| Contract storage | OPNet StoredMap / StoredValue primitives (not plain AS Map) |
| Contract interaction | `@btc-vision/opnet` — getContract → simulate → sendTransaction |
| Wallet | OPWallet |
| Frontend | React + Vite + TypeScript |
| Styling | Tailwind CSS |
| Market metadata | On-chain strings (question + description stored in contract state) |
| Network | OPNet testnet → mainnet |
| Hosting | Vercel |
