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

// Resolve any address (opt1..., bc1q..., or 0x hex public key) → Address object.
// The SDK only accepts Address objects for ADDRESS-typed ABI params.
async function resolveAddr(addressString) {
    if (!addressString) throw new Error('Empty address');
    // Already a hex public key — parse directly
    if (addressString.startsWith('0x')) {
        return Address.fromString(addressString);
    }
    // Look up the public key on-chain via RPC
    const prov = getProvider();
    try {
        const info = await prov.getPublicKeyInfo(addressString, false);
        if (info) return info;
    } catch {}
    throw new Error(
        `Public key not found for ${addressString}.\n` +
        `If this address has no on-chain history yet, provide its hex public key (0x02...) instead.`
    );
}

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
    // getPosition needs the same Address representation the contract stored when staking.
    // getSender resolves via RPC first, then falls back to OPWallet's MLDSA key.
    const userAddr = await getSender(userAddress);
    if (!userAddr) return null;
    const p = await read(PM(), PM_ABI, 'getPosition', [BigInt(marketId), userAddr]);
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
    const [resolverAddr, tokenAddr] = await Promise.all([
        resolveAddr(resolver),
        resolveAddr(paymentToken),
    ]);
    return execute(PM(), PM_ABI, 'createMarket', [
        question,
        description,
        resolverAddr,
        tokenAddr,
        BigInt(endBlock),
        BigInt(resolutionDeadlineDelta),
        BigInt(feeBpsOverride),
    ], senderAddress);
}

const INCREASE_ALLOWANCE_ABI = [{
    name: 'increaseAllowance', type: 'function',
    inputs: [{ name: 'spender', type: 'ADDRESS' }, { name: 'amount', type: 'UINT256' }],
    outputs: [],
}];

export async function approveToken(senderAddress, tokenAddress, amountSats) {
    const spender = await resolveAddr(CONTRACTS.PREDICTION_MARKET);
    return execute(tokenAddress, INCREASE_ALLOWANCE_ABI, 'increaseAllowance',
        [spender, BigInt(amountSats)], senderAddress);
}

export async function stakePosition(senderAddress, marketId, side, amountSats) {
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
    return execute(PM(), PM_ABI, 'withdrawFees', [await resolveAddr(tokenAddress)], senderAddress);
}

// ═══════════════════════════════════════════════════════════
// TestWBTC
// ═══════════════════════════════════════════════════════════

const BALANCE_OF_ABI = [{
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'ADDRESS' }],
    outputs: [{ name: 'balance', type: 'UINT256' }],
}];

export async function getTokenBalance(userAddress) {
    if (!userAddress || !CONTRACTS.TEST_WBTC) return 0n;
    try {
        const addr = await getSender(userAddress);
        if (!addr) return 0n;
        const p = await read(CONTRACTS.TEST_WBTC, BALANCE_OF_ABI, 'balanceOf', [addr]);
        return p?.balance ?? 0n;
    } catch {
        return 0n;
    }
}

export async function mintFromFaucet(senderAddress) {
    return execute(CONTRACTS.TEST_WBTC, testWBTCABI.functions, 'faucet', [], senderAddress);
}
