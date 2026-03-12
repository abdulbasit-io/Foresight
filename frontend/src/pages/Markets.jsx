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
      </div>

      {/* Faucet / token section */}
      {CONTRACTS.TEST_WBTC && (
        <div className="faucet-section">
          {!isConnected && (
            <p className="faucet-hint">
              Connect OPWallet, then mint free tWBTC from the faucet below to start betting.
            </p>
          )}

          {isConnected && (
            <>
              {/* Zero balance — prominent card */}
              {balance !== null && balance === 0n && faucetState === 'idle' && (
                <div className="faucet-banner">
                  <div className="faucet-banner-content">
                    <strong>You need tWBTC to place bets</strong>
                    <span>Mint 0.1 tWBTC free from the testnet faucet. Confirms on Bitcoin in ~10 minutes.</span>
                  </div>
                  <button className="btn btn-primary faucet-banner-btn" onClick={handleFaucet}>
                    Mint free tWBTC
                  </button>
                </div>
              )}

              {/* Has balance or mid-flow — compact status row */}
              {(balance === null || balance > 0n || faucetState !== 'idle') && (
                <div className="faucet-status-row">
                  <span className="faucet-balance-chip">
                    {balance === null ? 'Loading balance…' : `Balance: ${formatBtc(balance)}`}
                  </span>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleFaucet}
                    disabled={faucetState === 'loading'}
                  >
                    {faucetState === 'loading' ? 'Minting…' :
                     faucetState === 'done'    ? '✓ Minted 0.1 tWBTC' :
                     faucetState === 'error'   ? '✗ Failed — retry' :
                     'Mint more tWBTC'}
                  </button>
                </div>
              )}

              {faucetState === 'done' && (
                <p className="faucet-confirm-note">
                  Confirming on Bitcoin (~10 min). Not showing in OPWallet?
                  Add the token contract manually: <code>{CONTRACTS.TEST_WBTC}</code>
                </p>
              )}
              {faucetState === 'error' && faucetError && (
                <p className="faucet-error-note">{faucetError}</p>
              )}
            </>
          )}
        </div>
      )}

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
