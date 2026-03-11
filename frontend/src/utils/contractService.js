// ═══════════════════════════════════════════════════════════
// PredictionMarket + TestWBTC — On-Chain Contract Service
// ═══════════════════════════════════════════════════════════

import { getContract } from 'opnet';
import { Address } from '@btc-vision/transaction';
import { networks } from '@btc-vision/bitcoin';
import { CONTRACTS } from './constants';
import { getProvider } from './opnetProvider';
import predictionMarketABI from '../../../contract/abis/PredictionMarket.abi.json';
import testWBTCABI from '../../../contract/abis/TestWBTC.abi.json';

const NETWORK = networks.testnet;

// ── Resolve sender public key from OPWallet ───────────────
async function getSender(address) {
    const prov = getProvider();

    // Try RPC first (works once the address has any on-chain history)
    try {
        const info = await prov.getPublicKeyInfo(address, false);
        if (info) return info;
    } catch {}

    // Fall back to reading directly from OPWallet
    if (window.opnet?.web3?.getMLDSAPublicKey) {
        const [mldsaHex, legacyHex] = await Promise.all([
            window.opnet.web3.getMLDSAPublicKey(),
            window.opnet.getPublicKey?.() ?? Promise.resolve(null),
        ]);
        if (mldsaHex) return Address.fromString(mldsaHex, legacyHex || undefined);
    }

    return null;
}

// ── Generic simulate + send ───────────────────────────────
async function execute(contractAddress, abi, methodName, args, senderAddress) {
    if (!window.opnet?.web3) throw new Error('OPWallet not detected');

    const prov = getProvider();
    const sender = await getSender(senderAddress);
    if (!sender) throw new Error('Could not resolve sender public key');

    const c = getContract(contractAddress, abi, prov, NETWORK, sender);
    const sim = await c[methodName](...args);
    if (sim.revert) throw new Error(`Reverted: ${sim.revert}`);

    const receipt = await sim.sendTransaction({
        signer: null,
        mldsaSigner: null,
        refundTo: senderAddress,
        maximumAllowedSatToSpend: 0n,
        network: NETWORK,
    });

    return receipt.transactionId;
}

// ── Read-only call ────────────────────────────────────────
async function read(contractAddress, abi, methodName, args = []) {
    const prov = getProvider();
    const c = getContract(contractAddress, abi, prov, NETWORK);
    const result = await c[methodName](...args);
    return result?.properties ?? null;
}

// ═══════════════════════════════════════════════════════════
// PredictionMarket
// ═══════════════════════════════════════════════════════════

const PM = () => CONTRACTS.PREDICTION_MARKET;
const PM_ABI = predictionMarketABI.functions;

export async function getMarketCount() {
    const p = await read(PM(), PM_ABI, 'getMarketCount');
    return Number(p?.count ?? 0n);
}

export async function getMarket(marketId) {
    const p = await read(PM(), PM_ABI, 'getMarket', [BigInt(marketId)]);
    if (!p) return null;
    return {
        id: marketId,
        question:           p.question ?? '',
        description:        p.description ?? '',
        resolver:           p.resolver?.toString(16) ?? '',
        paymentToken:       p.paymentToken?.toString(16) ?? '',
        endBlock:           p.endBlock ?? 0n,
        resolutionDeadline: p.resolutionDeadline ?? 0n,
        yesPool:            p.yesPool ?? 0n,
        noPool:             p.noPool ?? 0n,
        outcome:            Number(p.outcome ?? 0n),
        feeBps:             Number(p.feeBps ?? 200n),
        creator:            p.creator?.toString(16) ?? '',
        createdAt:          p.createdAt ?? 0n,
    };
}

export async function getAllMarkets() {
    const count = await getMarketCount();
    if (!count) return [];
    const all = await Promise.all(Array.from({ length: count }, (_, i) => getMarket(i)));
    return all.filter(Boolean);
}

export async function getPosition(marketId, userAddress) {
    const p = await read(PM(), PM_ABI, 'getPosition', [BigInt(marketId), userAddress]);
    if (!p) return null;
    return {
        yesStake:  p.yesStake ?? 0n,
        noStake:   p.noStake ?? 0n,
        hasClaimed: (p.hasClaimed ?? 0n) !== 0n,
    };
}

export async function getOdds(marketId) {
    const p = await read(PM(), PM_ABI, 'getOdds', [BigInt(marketId)]);
    if (!p) return null;
    return {
        yesPool:    p.yesPool ?? 0n,
        noPool:     p.noPool ?? 0n,
        yesPercent: Number(p.yesPercent ?? 5000n) / 100,
    };
}

export async function createMarket(senderAddress, {
    question, description, resolver, paymentToken,
    endBlock, resolutionDeadlineDelta, feeBpsOverride = 0,
}) {
    return execute(PM(), PM_ABI, 'createMarket', [
        question,
        description,
        resolver,        // address string — SDK encodes directly
        paymentToken,    // address string — SDK encodes directly
        BigInt(endBlock),
        BigInt(resolutionDeadlineDelta),
        BigInt(feeBpsOverride),
    ], senderAddress);
}

export async function approveAndStake(senderAddress, marketId, side, amountSats, tokenAddress) {
    const approveABI = [{
        name: 'approve', type: 'Function',
        inputs: [{ name: 'spender', type: 'ADDRESS' }, { name: 'amount', type: 'UINT256' }],
        outputs: [{ name: 'success', type: 'BOOL' }],
    }];

    // Step 1: approve prediction market to spend tWBTC
    await execute(tokenAddress, approveABI, 'approve',
        [CONTRACTS.PREDICTION_MARKET, BigInt(amountSats)], senderAddress);

    // Step 2: stake
    return execute(PM(), PM_ABI, 'stake',
        [BigInt(marketId), side, BigInt(amountSats)], senderAddress);
}

export async function resolveMarket(senderAddress, marketId, outcome) {
    return execute(PM(), PM_ABI, 'resolve', [BigInt(marketId), BigInt(outcome)], senderAddress);
}

export async function cancelMarket(senderAddress, marketId) {
    return execute(PM(), PM_ABI, 'cancel', [BigInt(marketId)], senderAddress);
}

export async function claimWinnings(senderAddress, marketId) {
    return execute(PM(), PM_ABI, 'claim', [BigInt(marketId)], senderAddress);
}

export async function refundStake(senderAddress, marketId) {
    return execute(PM(), PM_ABI, 'refund', [BigInt(marketId)], senderAddress);
}

export async function withdrawFees(senderAddress, tokenAddress) {
    return execute(PM(), PM_ABI, 'withdrawFees', [tokenAddress], senderAddress);
}

// ═══════════════════════════════════════════════════════════
// TestWBTC
// ═══════════════════════════════════════════════════════════

export async function mintFromFaucet(senderAddress) {
    return execute(CONTRACTS.TEST_WBTC, testWBTCABI.functions, 'faucet', [], senderAddress);
}
