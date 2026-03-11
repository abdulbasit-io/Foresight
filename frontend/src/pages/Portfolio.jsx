import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import { getAllMarkets, getPosition, claimWinnings, refundStake, getTokenBalance, mintFromFaucet } from '../utils/contractService';
import { formatBtc, outcomeLabel } from '../utils/formatters';
import { OUTCOME, CONTRACTS } from '../utils/constants';

export default function Portfolio() {
  const { isConnected, address } = useWallet();
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionState, setActionState] = useState({}); // marketId → 'loading' | 'done' | 'error'
  const [txMap, setTxMap] = useState({});
  const [balance, setBalance] = useState(null);
  const [faucetState, setFaucetState] = useState('idle');
  const [faucetError, setFaucetError] = useState('');

  useEffect(() => {
    if (!isConnected || !address) return;
    if (!CONTRACTS.PREDICTION_MARKET) {
      setError('Contract address not configured.');
      return;
    }
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
      await loadPositions();
    } catch (e) {
      setActionState(s => ({ ...s, [marketId]: 'error:' + e.message }));
    }
  }

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
                  setTimeout(() => setFaucetState('idle'), 5000);
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

      {loading && <div className="center-msg">Loading positions from chain...</div>}
      {error && <div className="error-msg">{error}</div>}
      {!loading && !error && positions.length === 0 && (
        <div className="center-msg">
          No positions found.{' '}
          <Link to="/markets" className="link">Browse markets</Link> to place your first bet.
        </div>
      )}

      <div className="portfolio-list">
        {positions.map(m => {
          const label = outcomeLabel(m.outcome);
          const isResolved = m.outcome === OUTCOME.YES || m.outcome === OUTCOME.NO;
          const isCancelled = m.outcome === OUTCOME.CANCELLED;
          const pos = m.position;

          const userWon = isResolved && (
            (m.outcome === OUTCOME.YES && pos.yesStake > 0n) ||
            (m.outcome === OUTCOME.NO && pos.noStake > 0n)
          );
          const canClaim = userWon && !pos.hasClaimed;
          const canRefund = isCancelled && !pos.hasClaimed;

          const state = actionState[m.id] || 'idle';
          const txId = txMap[m.id];

          return (
            <div key={m.id} className="portfolio-card">
              <div className="portfolio-card-header">
                <Link to={`/markets/${m.id}`} className="portfolio-question">
                  {m.question}
                </Link>
                <span className="status-badge" style={{
                  background: m.outcome === 0 ? 'rgba(129,255,211,0.08)' : 'rgba(86,94,103,0.1)',
                  color: m.outcome === 0 ? '#81FFD3' : '#565E67',
                }}>
                  {label}
                </span>
              </div>

              <div className="portfolio-stakes">
                {pos.yesStake > 0n && (
                  <span className="yes-color">YES: {formatBtc(pos.yesStake)}</span>
                )}
                {pos.noStake > 0n && (
                  <span className="no-color"> NO: {formatBtc(pos.noStake)}</span>
                )}
                {pos.hasClaimed && <span className="muted"> (Settled)</span>}
              </div>

              {canClaim && (
                <button
                  className="btn btn-success"
                  disabled={state === 'loading'}
                  onClick={() => handleClaim(m.id)}
                >
                  {state === 'loading' ? 'Claiming...' : 'Claim Winnings'}
                </button>
              )}

              {canRefund && (
                <button
                  className="btn btn-secondary"
                  disabled={state === 'loading'}
                  onClick={() => handleRefund(m.id)}
                >
                  {state === 'loading' ? 'Refunding...' : 'Refund Stake'}
                </button>
              )}

              {txId && (
                <div className="tx-success" style={{ marginTop: '0.5rem' }}>
                  Tx: {txId.slice(0, 20)}...
                </div>
              )}
              {state.startsWith('error:') && (
                <div className="tx-error" style={{ marginTop: '0.5rem' }}>
                  {state.replace('error:', '')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
