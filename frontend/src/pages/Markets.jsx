import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import { getAllMarkets, mintFromFaucet, getTokenBalance } from '../utils/contractService';
import { formatBtc, blocksToApproxTime, outcomeLabel } from '../utils/formatters';
import { OUTCOME, STATUS_CONFIG, CONTRACTS } from '../utils/constants';
import { getBlockNumber } from '../utils/opnetProvider';

const FILTER_OPTIONS = ['All', 'Open', 'Resolved', 'Cancelled'];

export default function Markets() {
  const { isConnected, address } = useWallet();
  const [markets, setMarkets] = useState([]);
  const [currentBlock, setCurrentBlock] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [error, setError] = useState('');
  const [faucetState, setFaucetState] = useState('idle'); // idle | loading | done | error
  const [faucetError, setFaucetError] = useState('');
  const [balance, setBalance] = useState(null); // null = not loaded yet

  async function load() {
    if (!CONTRACTS.PREDICTION_MARKET) {
      setError('Contract address not configured. Add VITE_PREDICTION_MARKET_CONTRACT to .env');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [all, blk] = await Promise.all([getAllMarkets(), getBlockNumber()]);
      setMarkets(all);
      if (blk != null) setCurrentBlock(Number(blk));
    } catch (e) {
      setError('Failed to load markets: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (isConnected && address && CONTRACTS.TEST_WBTC) {
      getTokenBalance(address).then(setBalance);
    }
  }, [isConnected, address]);

  async function handleFaucet() {
    if (!isConnected) return;
    setFaucetState('loading');
    setFaucetError('');
    try {
      await mintFromFaucet(address);
      setFaucetState('done');
      // Refresh balance after faucet (~15s for block confirmation)
      setTimeout(() => getTokenBalance(address).then(setBalance), 15000);
      setTimeout(() => setFaucetState('idle'), 5000);
    } catch (e) {
      console.warn('Faucet failed:', e.message);
      setFaucetError(e.message || 'Unknown error');
      setFaucetState('error');
      setTimeout(() => setFaucetState('idle'), 6000);
    }
  }

  const filtered = markets.filter(m => {
    if (filter === 'All') return true;
    if (filter === 'Open') return m.outcome === OUTCOME.OPEN;
    if (filter === 'Resolved') return m.outcome === OUTCOME.YES || m.outcome === OUTCOME.NO;
    if (filter === 'Cancelled') return m.outcome === OUTCOME.CANCELLED;
    return true;
  });

  return (
    <div className="page">
      {/* Hero */}
      <div className="hero-section">
        <h1 className="hero-title">Prediction <span className="gradient-text">Markets</span></h1>
        <p className="hero-sub">Bet on real-world outcomes with tWBTC — settled on Bitcoin L1</p>
        {isConnected && CONTRACTS.TEST_WBTC && (
          <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', width: '100%', maxWidth: 480 }}>
            {/* Balance line */}
            <p className="hero-sub" style={{ margin: 0, fontSize: '0.9rem' }}>
              {balance === null
                ? 'Loading balance…'
                : <>tWBTC Balance: <strong>{formatBtc(balance)}</strong></>}
            </p>

            {/* Zero-balance callout */}
            {balance !== null && balance === 0n && faucetState === 'idle' && (
              <div className="faucet-callout">
                <strong>You need tWBTC to place a bet.</strong>
                <br />
                This is testnet — hit the button below to mint 0.1 tWBTC for free. Takes ~10 min to confirm on Bitcoin.
              </div>
            )}

            <button
              className={`btn ${balance === 0n ? 'btn-primary' : 'btn-secondary'}`}
              onClick={handleFaucet}
              disabled={faucetState === 'loading'}
            >
              {faucetState === 'loading' ? 'Minting — sign the wallet prompt…' :
               faucetState === 'done'    ? '✓ Minted 0.1 tWBTC — confirming (~10 min)' :
               faucetState === 'error'   ? '✗ Failed — retry?' :
               'Mint free tWBTC (testnet faucet)'}
            </button>

            {faucetState === 'done' && (
              <p className="faucet-confirm-note">
                Your balance will update automatically once the Bitcoin block confirms (~10 min).
                If tWBTC doesn't appear in OPWallet, add the token manually:<br />
                <code style={{ fontSize: '0.7rem', wordBreak: 'break-all' }}>{CONTRACTS.TEST_WBTC}</code>
              </p>
            )}
            {faucetState === 'error' && faucetError && (
              <p style={{ color: '#ff6b6b', fontSize: '0.8rem', maxWidth: '400px', textAlign: 'center', margin: 0 }}>
                {faucetError}
              </p>
            )}
          </div>
        )}

        {/* Not connected — explain the flow before they connect */}
        {!isConnected && (
          <p className="hero-sub" style={{ marginTop: '1rem', fontSize: '0.85rem', opacity: 0.7 }}>
            Connect OPWallet → mint free tWBTC → place your first bet
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="filter-bar">
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt}
            className={filter === opt ? 'filter-btn active' : 'filter-btn'}
            onClick={() => setFilter(opt)}
          >
            {opt}
          </button>
        ))}
        <span className="filter-count">{filtered.length} markets</span>
        <button className="filter-btn" onClick={load} disabled={loading}>
          {loading ? '...' : 'Refresh'}
        </button>
      </div>

      {/* Content */}
      {loading && <div className="center-msg">Loading markets from chain...</div>}
      {error && <div className="error-msg">{error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <div className="center-msg">
          No markets found.{' '}
          <Link to="/create" className="link">Create the first one.</Link>
        </div>
      )}

      <div className="markets-grid">
        {filtered.map(market => (
          <MarketCard key={market.id} market={market} currentBlock={currentBlock} />
        ))}
      </div>
    </div>
  );
}

function MarketCard({ market, currentBlock }) {
  const label = outcomeLabel(market.outcome);
  const status = STATUS_CONFIG[label] || STATUS_CONFIG['OPEN'];
  const yesPool = Number(market.yesPool || 0n);
  const noPool = Number(market.noPool || 0n);
  const total = yesPool + noPool;
  const yesP = total > 0 ? Math.round((yesPool / total) * 100) : 50;

  return (
    <Link to={`/markets/${market.id}`} className="market-card">
      <div className="market-card-header">
        <span
          className="status-badge"
          style={{ background: status.bg, color: status.color }}
        >
          {status.label}
        </span>
        <span className="market-volume">{formatBtc(market.yesPool + market.noPool)}</span>
      </div>

      <p className="market-question">{market.question || 'Loading...'}</p>

      {/* Odds bar */}
      <div className="odds-bar-wrap">
        <div className="odds-bar">
          <div className="odds-yes" style={{ width: `${yesP}%` }} />
        </div>
        <div className="odds-labels">
          <span className="yes-label">YES {yesP}%</span>
          <span className="no-label">NO {100 - yesP}%</span>
        </div>
      </div>

      {market.outcome === OUTCOME.OPEN && currentBlock != null && (
        <div className="market-footer">
          <span className="time-remaining">
            Ends in {blocksToApproxTime(Number(market.endBlock) - currentBlock)}
          </span>
        </div>
      )}
    </Link>
  );
}
