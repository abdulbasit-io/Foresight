import { WBTC_DECIMALS, BLOCKS_PER_DAY, OUTCOME_LABEL } from './constants';

// ── wBTC formatting ──────────────────────────────────────
export function satsToBtc(sats) {
  if (sats === null || sats === undefined) return 0;
  return Number(BigInt(sats.toString())) / 10 ** WBTC_DECIMALS;
}

export function btcToSats(btc) {
  return BigInt(Math.round(btc * 10 ** WBTC_DECIMALS));
}

export function formatBtc(sats, decimals = 6) {
  const btc = satsToBtc(sats);
  if (btc === 0) return '0 wBTC';
  if (btc < 0.000001) return '< 0.000001 wBTC';
  return `${btc.toFixed(decimals).replace(/\.?0+$/, '')} wBTC`;
}

// ── Block helpers ─────────────────────────────────────────
export function blocksToApproxTime(blocks) {
  const n = Number(blocks);
  if (n <= 0) return 'ended';
  if (n < BLOCKS_PER_DAY) return `~${Math.round(n / 6)} hours`;
  const days = Math.round(n / BLOCKS_PER_DAY);
  if (days === 1) return '~1 day';
  return `~${days} days`;
}

export function blocksRemaining(endBlock, currentBlock) {
  if (!endBlock || !currentBlock) return null;
  const diff = Number(endBlock) - Number(currentBlock);
  return diff > 0 ? diff : 0;
}

// ── Address helpers ───────────────────────────────────────
export function formatAddress(addr) {
  if (!addr) return '';
  const s = addr.toString();
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
}

// ── Market helpers ────────────────────────────────────────
export function outcomeLabel(outcome) {
  return OUTCOME_LABEL[Number(outcome)] || 'UNKNOWN';
}

export function yesPercent(yesPool, noPool) {
  const y = Number(yesPool || 0n);
  const n = Number(noPool || 0n);
  const total = y + n;
  if (total === 0) return 50;
  return Math.round((y / total) * 100);
}

export function formatPercent(basisPoints) {
  return (Number(basisPoints) / 100).toFixed(1) + '%';
}
