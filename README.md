# Foresight — Prediction Markets on Bitcoin L1

> Polymarket, but on Bitcoin. Stake tWBTC on YES/NO outcomes. Winners claim a proportional share of the pool. Everything settles on-chain — no custodians, no intermediaries.

Built on [OPNet](https://opnet.org) using AssemblyScript smart contracts running directly on Bitcoin Layer 1.

---

## Quick Start

1. Install [OPWallet](https://chromewebstore.google.com/detail/opwallet/pmbjpcmaaladnfpacpmhmnfmpklgbdjb)
2. Get **tBTC** (gas) from the [OPNet faucet](https://faucet.opnet.org) — you need this to pay for transactions
3. Connect your wallet on the Markets page
4. Click **"Mint free tWBTC"** — this gives you 0.1 tWBTC, the token used for betting
5. Wait ~10 minutes for the Bitcoin block to confirm, then your balance appears
6. Open any market, approve tWBTC once, and bet

> **tWBTC is required to place bets.** It's a free testnet token — mint as much as you need from the faucet on the Markets page. Without it, all bet transactions will fail.

No accounts, no KYC, no wrapping.

---

## How Betting Works

- **Parimutuel model** — odds are determined by the ratio of YES vs NO stakes, not an order book
- **Approval is one-time** — approve tWBTC spending once per wallet; all future bets skip this step
- **~10 min confirmation** — Bitcoin blocks are ~10 min apart; your position appears after the transaction is mined
- **2% platform fee** — deducted from the total pool at resolution
- **Payout:** `your stake / winning pool × (total pool − fee)`

---

## Safety Guarantees

- If the resolver misses the deadline, **anyone can cancel** the market and all stakers receive a full refund
- Contracts hold no native BTC — all funds are OP20 tokens, auditable on-chain
- No admin key can alter a market after creation

---

## Project Structure

```
contract/          AssemblyScript smart contracts (→ WASM)
  src/prediction/  PredictionMarket — all markets in one contract
  src/testbtc/     TestWBTC — mintable OP20 test token
  abis/            ABI JSON files consumed by the frontend

frontend/          React + Vite SPA
  src/pages/       Markets, MarketDetail, Create, Portfolio
  src/utils/       contractService, formatters, constants
```

---

## Running Locally

```bash
# Contracts
cd contract && npm install
npm run build          # builds both contracts + patches ABI casing

# Frontend
cd frontend && npm install
cp .env.example .env   # fill in deployed contract addresses
npm run dev            # http://localhost:5174
```

---

## Tech Stack

| | |
|---|---|
| Contracts | AssemblyScript → WASM via OPNet |
| Wallet | OPWallet |
| Frontend | React 18, Vite, React Router, Tailwind-style CSS |
| Chain interaction | `opnet` SDK, `@btc-vision/transaction` |
| Network | OPNet testnet (Bitcoin testnet4) |
| Hosting | Vercel |
