import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import {
  getAllMarkets,
  getPosition,
  claimWinnings,
  refundStake,
  getTokenBalance,
  mintFromFaucet,
} from '../utils/contractService';
import { formatBtc, outcomeLabel } from '../utils/formatters';
import { OUTCOME, CONTRACTS } from '../utils/constants';

// Mirror of contract's claim() payout formula
function calcPayout(market, pos) {
  const yesPool = market.yesPool || 0n;
  const noPool  = market.noPool  || 0n;
  const total   = yesPool + noPool;
  const fee     = total * BigInt(market.feeBps) / 10000n;
  const net     = total - fee;
  const isYes   = market.outcome === OUTCOME.YES;
  const stake   = isYes ? pos.yesStake : pos.noStake;
  const winPool = isYes ? yesPool : noPool;
  if (winPool === 0n || stake === 0n) return 0n;
  return stake * net / winPool;
}

function resultBadge(market, pos) {
  const isResolved  = market.outcome === OUTCOME.YES || market.outcome === OUTCOME.NO;
  const isCancelled = market.outcome === OUTCOME.CANCELLED;

  if (isCancelled) {
    return pos.hasClaimed
      ? <span className="result-badge result-refunded">Refunded</span>
      : <span className="result-badge result-refund-avail">Refund Available</span>;
  }
  if (!isResolved) {
    return <span className="result-badge result-open">Open</span>;
  }
  const won = (market.outcome === OUTCOME.YES && pos.yesStake > 0n) ||
              (market.outcome === OUTCOME.NO  && pos.noStake  > 0n);
  if (won) {
    return pos.hasClaimed
      ? <span className="result-badge result-claimed">Claimed</span>
      : <span className="result-badge result-won">Won</span>;
  }
  return <span className="result-badge result-lost">Lost</span>;
}

export default function Portfolio() {
  const { isConnected, address } = useWallet();
  const [positions, setPositions]     = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [actionState, setActionState] = useState({});
  const [claimDone, setClaimDone]     = useState({});
  const [txMap, setTxMap]             = useState({});
  const [balance, setBalance]         = useState(null);
  const [faucetState, setFaucetState] = useState('idle');
  const [faucetError, setFaucetError] = useState('');

  useEffect(() => {
    if (!isConnected || !address) return;
    if (!CONTRACTS.PREDICTION_MARKET) { setError('Contract address not configured.'); return; }
    loadPositions();
    if (CONTRACTS.TEST_WBTC) getTokenBalance(address).then(setBalance);
  }, [isConnected, address]);

  async function loadPositions() {
    setLoading(true);
    setError('');
    try {
      const markets = await getAllMarkets();
      const results = await Promise.all(
        markets.map(async (m) => {
          const pos = await getPosition(m.id, address);
          if (!pos) return null;
          if (pos.yesStake === 0n && pos.noStake === 0n) return null;
          return { ...m, position: pos };
        })
      );
      setPositions(results.filter(Boolean));
    } catch (e) {
      setError('Failed to load positions: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleClaim(marketId) {
    setActionState(s => ({ ...s, [marketId]: 'loading' }));
    try {
      const txId = await claimWinnings(address, marketId);
      setTxMap(m => ({ ...m, [marketId]: txId }));
      setActionState(s => ({ ...s, [marketId]: 'done' }));
      setClaimDone(d => ({ ...d, [marketId]: true }));
      await loadPositions();
    } catch (e) {
      setActionState(s => ({ ...s, [marketId]: 'error:' + e.message }));
    }
  }

  async function handleRefund(marketId) {
    setActionState(s => ({ ...s, [marketId]: 'loading' }));
    try {
      const txId = await refundStake(address, marketId);
      setTxMap(m => ({ ...m, [marketId]: txId }));
      setActionState(s => ({ ...s, [marketId]: 'done' }));
      setClaimDone(d => ({ ...d, [marketId]: true }));
      await loadPositions();
    } catch (e) {
      setActionState(s => ({ ...s, [marketId]: 'error:' + e.message }));
    }
  }

  // ── P&L summary calculations ──────────────────────────
  const totalStaked = positions.reduce((acc, m) => {
    return acc + (m.position.yesStake || 0n) + (m.position.noStake || 0n);
  }, 0n);

  const claimable = positions.reduce((acc, m) => {
    const isResolved = m.outcome === OUTCOME.YES || m.outcome === OUTCOME.NO;
    const won = isResolved && (
      (m.outcome === OUTCOME.YES && m.position.yesStake > 0n) ||
      (m.outcome === OUTCOME.NO  && m.position.noStake  > 0n)
    );
    if (won && !m.position.hasClaimed) return acc + calcPayout(m, m.position);
    return acc;
  }, 0n);

  // ── Not connected ──────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="page">
        <div className="center-card">
          <div className="center-card-icon">💼</div>
          <h2>Your Portfolio</h2>
          <p className="muted">Connect your OPWallet to see your positions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="hero-section">
        <h1 className="hero-title">Your <span className="gradient-text">Portfolio</span></h1>
        <p className="hero-sub">Track your open and settled positions</p>

        {/* tWBTC balance + faucet */}
        {CONTRACTS.TEST_WBTC && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            {balance !== null && (
              <p className="hero-sub" style={{ margin: 0, fontSize: '0.9rem' }}>
                tWBTC Balance: <strong>{formatBtc(balance)} tWBTC</strong>
              </p>
            )}
            <button
              className="btn btn-secondary"
              disabled={faucetState === 'loading'}
              onClick={async () => {
                setFaucetState('loading');
                setFaucetError('');
                try {
                  await mintFromFaucet(address);
                  setFaucetState('done');
                  setTimeout(() => getTokenBalance(address).then(setBalance), 15000);
                  setTimeout(() => setFaucetState('idle'), 15000);
                } catch (e) {
                  setFaucetError(e.message || 'Unknown error');
                  setFaucetState('error');
                  setTimeout(() => setFaucetState('idle'), 6000);
                }
              }}
            >
              {faucetState === 'loading' ? 'Minting…' :
               faucetState === 'done'    ? '✓ Got 0.1 tWBTC! (confirming…)' :
               faucetState === 'error'   ? '✗ Failed — retry?' :
               'Get tWBTC (faucet)'}
            </button>
            {faucetState === 'error' && faucetError && (
              <p style={{ color: '#ff6b6b', fontSize: '0.8rem', maxWidth: '400px', textAlign: 'center', margin: 0 }}>
                {faucetError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* P&L summary bar */}
      {positions.length > 0 && (
        <div className="pnl-summary">
          <div className="pnl-item">
            <span className="pnl-label">Total Staked</span>
            <strong className="pnl-value">{formatBtc(totalStaked)} tWBTC</strong>
          </div>
          <div className="pnl-divider" />
          <div className="pnl-item">
            <span className="pnl-label">Claimable Now</span>
            <strong className="pnl-value yes-color">
              {claimable > 0n ? formatBtc(claimable) + ' tWBTC' : '—'}
            </strong>
          </div>
          <div className="pnl-divider" />
          <div className="pnl-item">
            <span className="pnl-label">Open Positions</span>
            <strong className="pnl-value">
              {positions.filter(m => m.outcome === OUTCOME.OPEN).length}
            </strong>
          </div>
        </div>
      )}

      {loading && <div className="center-msg">Loading positions from chain...</div>}
      {error   && <div className="error-msg">{error}</div>}
      {!loading && !error && positions.length === 0 && (
        <div className="center-msg">
          No positions found.{' '}
          <Link to="/markets" className="link">Browse markets</Link> to place your first bet.
        </div>
      )}

      <div className="portfolio-list">
        {positions.map(m => {
          const pos         = m.position;
          const isResolved  = m.outcome === OUTCOME.YES || m.outcome === OUTCOME.NO;
          const isCancelled = m.outcome === OUTCOME.CANCELLED;

          const won = isResolved && (
            (m.outcome === OUTCOME.YES && pos.yesStake > 0n) ||
            (m.outcome === OUTCOME.NO  && pos.noStake  > 0n)
          );
          const canClaim  = won && !pos.hasClaimed;
          const canRefund = isCancelled && !pos.hasClaimed &&
                            (pos.yesStake > 0n || pos.noStake > 0n);

          const payout     = canClaim ? calcPayout(m, pos) : 0n;
          const stateKey   = actionState[m.id] || 'idle';
          const txId       = txMap[m.id];
          const isDone     = claimDone[m.id];

          const userStake  = won
            ? (m.outcome === OUTCOME.YES ? pos.yesStake : pos.noStake)
            : (pos.yesStake > 0n ? pos.yesStake : pos.noStake);
          const returnPct  = canClaim && userStake > 0n
            ? (((Number(payout) - Number(userStake)) / Number(userStake)) * 100).toFixed(1)
            : null;

          return (
            <div key={m.id} className={`portfolio-card ${won && !pos.hasClaimed ? 'portfolio-card-won' : ''}`}>
              <div className="portfolio-card-header">
                <Link to={`/markets/${m.id}`} className="portfolio-question">
                  {m.question}
                </Link>
                {resultBadge(m, pos)}
              </div>

              <div className="portfolio-stakes">
                {pos.yesStake > 0n && (
                  <span className="yes-color">YES: {formatBtc(pos.yesStake)}</span>
                )}
                {pos.noStake > 0n && (
                  <span className="no-color"> NO: {formatBtc(pos.noStake)}</span>
                )}
              </div>

              {/* Estimated payout for unclaimed wins */}
              {canClaim && payout > 0n && (
                <div className="payout-estimate" style={{ marginTop: '0.4rem' }}>
                  Est. payout: <strong>{formatBtc(payout)} tWBTC</strong>
                  {returnPct && (
                    <span className="yes-color"> (+{returnPct}%)</span>
                  )}
                </div>
              )}

              {canClaim && (
                <button
                  className="btn btn-success"
                  disabled={stateKey === 'loading'}
                  onClick={() => handleClaim(m.id)}
                  style={{ marginTop: '0.5rem' }}
                >
                  {stateKey === 'loading' ? 'Claiming...' : `Claim ${formatBtc(payout)} tWBTC`}
                </button>
              )}

              {canRefund && (
                <button
                  className="btn btn-secondary"
                  disabled={stateKey === 'loading'}
                  onClick={() => handleRefund(m.id)}
                  style={{ marginTop: '0.5rem' }}
                >
                  {stateKey === 'loading' ? 'Refunding...' : 'Refund Stake'}
                </button>
              )}

              {isDone && (
                <div className="bet-confirmed-note" style={{ marginTop: '0.5rem' }}>
                  {canRefund
                    ? 'Refund sent — arrives in ~10 min after next Bitcoin block.'
                    : 'Winnings sent — arrives in ~10 min after next Bitcoin block.'}
                </div>
              )}

              {txId && !isDone && (
                <div className="tx-success" style={{ marginTop: '0.5rem' }}>
                  Tx: {txId.slice(0, 20)}...
                </div>
              )}
              {stateKey.startsWith('error:') && (
                <div className="tx-error" style={{ marginTop: '0.5rem' }}>
                  {stateKey.replace('error:', '')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
