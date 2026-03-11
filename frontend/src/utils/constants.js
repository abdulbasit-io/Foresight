// ═══════════════════════════════════════════════════════════
// Foresight — Constants & Configuration
// ═══════════════════════════════════════════════════════════

export const NETWORK = 'testnet';
export const RPC_URL = 'https://testnet.opnet.org';

// Token decimals (wBTC has 8 decimals, same as BTC sats)
export const WBTC_DECIMALS = 8;

// Market outcome values (match contract constants)
export const OUTCOME = {
  OPEN: 0,
  YES: 1,
  NO: 2,
  CANCELLED: 3,
};

export const OUTCOME_LABEL = {
  0: 'OPEN',
  1: 'RESOLVED YES',
  2: 'RESOLVED NO',
  3: 'CANCELLED',
};

// Staking sides
export const SIDE_YES = 1n;
export const SIDE_NO = 2n;

// Platform defaults
export const DEFAULT_FEE_BPS = 200; // 2%
export const BASIS_POINTS = 10000;
export const BLOCKS_PER_DAY = 144; // ~10 min per block
export const DEFAULT_RESOLUTION_DELTA = 144; // 1 day after end

// Contract addresses from .env
export const CONTRACTS = {
  PREDICTION_MARKET: import.meta.env.VITE_PREDICTION_MARKET_CONTRACT || '',
  TEST_WBTC: import.meta.env.VITE_TEST_WBTC_CONTRACT || '',
};

export const LINKS = {
  OPNET: 'https://opnet.org',
  DOCS: 'https://docs.opnet.org',
  OPWALLET: 'https://chromewebstore.google.com/detail/opwallet/pmbjpcmaaladnfpacpmhmnfmpklgbdjb',
  FAUCET: 'https://faucet.opnet.org',
  DISCORD: 'https://discord.com/invite/opnet',
  TWITTER: 'https://x.com/opnetbtc',
};

// Status display config
export const STATUS_CONFIG = {
  OPEN: { label: 'Open', color: '#81FFD3', bg: 'rgba(129,255,211,0.08)' },
  'RESOLVED YES': { label: 'YES Won', color: '#81FFD3', bg: 'rgba(129,255,211,0.08)' },
  'RESOLVED NO': { label: 'NO Won', color: '#FF6B6B', bg: 'rgba(255,107,107,0.08)' },
  CANCELLED: { label: 'Cancelled', color: '#565E67', bg: 'rgba(86,94,103,0.1)' },
};
