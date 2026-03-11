import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAllMarkets } from '../utils/contractService';
import { formatBtc, blocksToApproxTime, outcomeLabel } from '../utils/formatters';
import { OUTCOME, STATUS_CONFIG, CONTRACTS } from '../utils/constants';

const FILTER_OPTIONS = ['All', 'Open', 'Resolved', 'Cancelled'];

export default function Markets() {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!CONTRACTS.PREDICTION_MARKET) {
        setError('Contract address not configured. Add VITE_PREDICTION_MARKET_CONTRACT to .env');
        setLoading(false);
        return;
      }
      try {
        const all = await getAllMarkets();
        setMarkets(all);
      } catch (e) {
        setError('Failed to load markets: ' + e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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
        <p className="hero-sub">Bet on real-world outcomes with wBTC — settled on Bitcoin L1</p>
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
          <MarketCard key={market.id} market={market} />
        ))}
      </div>
    </div>
  );
}

function MarketCard({ market }) {
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

      {market.outcome === Number(0n) && (
        <div className="market-footer">
          <span className="time-remaining">
            Ends in {blocksToApproxTime(Number(market.endBlock))}
          </span>
        </div>
      )}
    </Link>
  );
}
