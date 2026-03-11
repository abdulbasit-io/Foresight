# Foresight — Prediction Markets on Bitcoin L1

Binary parimutuel prediction markets built on [OPNet](https://opnet.org). Stake tWBTC on YES or NO outcomes. Winners claim a proportional share of the pool. Everything settles on Bitcoin Layer 1.

---

## How It Works

1. **Get tokens** — Call `faucet()` on the TestWBTC contract to receive 0.1 tWBTC per call
2. **Browse markets** — Open markets show live odds and time remaining
3. **Place a bet** — Approve tWBTC spend, then stake on YES or NO (two transactions)
4. **Wait for resolution** — The designated resolver calls `resolve()` after the end block
5. **Claim winnings** — Winners claim their proportional share of the total pool minus a 2% fee

If the resolver misses the deadline, anyone can cancel the market and all stakers are fully refunded.

---

## Project Structure

```
Project_3/
├── contract/               # AssemblyScript smart contracts
│   ├── src/
│   │   ├── prediction/     # PredictionMarket.ts — main contract
│   │   └── testbtc/        # TestWBTC.ts — mintable OP20 test token
│   ├── abis/               # ABI JSON files for frontend
│   └── asconfig.json       # Multi-target build config
└── frontend/               # React + Vite frontend
    ├── src/
    │   ├── pages/          # Markets, MarketDetail, Create, Portfolio, LandingPage
    │   ├── components/     # Navbar, Footer, WalletButton
    │   ├── context/        # WalletContext (OPWallet integration)
    │   └── utils/          # contractService, formatters, constants, opnetProvider
    └── .env.example
```

---

## Contracts

### PredictionMarket

Single contract hosting all markets. No per-market deployment.

| Method | Description |
|---|---|
| `createMarket(question, description, resolver, paymentToken, endBlock, resolutionDeadlineDelta, feeBpsOverride)` | Create a new binary market |
| `stake(marketId, side, amount)` | Stake tWBTC on YES (1) or NO (2) |
| `resolve(marketId, outcome)` | Resolver sets outcome after end block |
| `cancel(marketId)` | Cancel market (resolver anytime, anyone after deadline) |
| `claim(marketId)` | Winners claim proportional payout |
| `refund(marketId)` | Full refund on cancelled markets |
| `withdrawFees(token)` | Owner withdraws accumulated platform fees |
| `getMarket(marketId)` | Read market state |
| `getPosition(marketId, user)` | Read user's stake and claim status |
| `getOdds(marketId)` | Read current YES/NO pool sizes and percentages |
| `getMarketCount()` | Total number of markets |

**Payout formula:** `payout = userStake * (totalPool - fee) / winningPool`

**Market states:** `0 = OPEN` → `1 = YES Won` / `2 = NO Won` / `3 = CANCELLED`

**Storage capacity:** Up to 5,457 markets per contract deployment.

### TestWBTC

OP20 token with a public `faucet()` — mints 0.1 tWBTC to the caller. Use tBTC from the OPNet faucet for gas; use tWBTC for betting.

---

## Setup

### Prerequisites

- [OPWallet](https://chromewebstore.google.com/detail/opwallet/pmbjpcmaaladnfpacpmhmnfmpklgbdjb) browser extension
- Node.js 18+
- tBTC from the [OPNet faucet](https://faucet.opnet.org)

### Build Contracts

```bash
cd contract
npm install
npm run build:prediction   # builds PredictionMarket.wasm
npm run build:testbtc      # builds TestWBTC.wasm
npm run build              # builds both
```

### Deploy

Deploy both contracts on OPNet testnet using your preferred deployment tool. Note the deployed addresses.

### Configure Frontend

```bash
cd frontend
cp .env.example .env
```

Edit `.env`:

```
VITE_PREDICTION_MARKET_CONTRACT=<deployed PredictionMarket address>
VITE_TEST_WBTC_CONTRACT=<deployed TestWBTC address>
```

### Run Frontend

```bash
cd frontend
npm install
npm run dev     # http://localhost:5174
npm run build   # production build
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Contracts | AssemblyScript → WASM via OPNet |
| Wallet | OPWallet |
| Frontend | React 18, Vite, React Router |
| Chain interaction | `opnet` SDK, `@btc-vision/transaction` |
| Network | OPNet testnet (Bitcoin testnet) |
| Hosting | Vercel (SPA rewrite via `vercel.json`) |

---

## Key Design Decisions

- **No native BTC in contracts** — OPNet contracts cannot hold native BTC. All bets use tWBTC (OP20).
- **Block numbers, not timestamps** — ~144 blocks per day (~10 min/block).
- **Single contract for all markets** — avoids per-market deployment overhead.
- **Parimutuel model** — no order book; odds are determined by pool ratios at resolution time.
- **Trusted resolver per market** — the creator designates a resolver address. Auto-cancel safety net protects stakers if the resolver goes missing.
