import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import {
  getMarket,
  getPosition,
  getOdds,
  approveAndStake,
  resolveMarket,
  cancelMarket,
  claimWinnings,
  refundStake,
} from '../utils/contractService';
import { formatBtc, btcToSats, outcomeLabel, blocksToApproxTime } from '../utils/formatters';
import { OUTCOME, SIDE_YES, SIDE_NO, CONTRACTS, WBTC_DECIMALS } from '../utils/constants';

export default function MarketDetail() {
  const { id } = useParams();
  const { isConnected, address } = useWallet();

  const [market, setMarket] = useState(null);
  const [odds, setOdds] = useState(null);
  const [position, setPosition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Stake UI
  const [stakeAmount, setStakeAmount] = useState('');
  const [stakeSide, setStakeSide] = useState(null); // SIDE_YES or SIDE_NO
  const [stakeStep, setStakeStep] = useState('idle'); // idle | approving | staking | done

  // Resolve UI
  const [resolveOutcome, setResolveOutcome] = useState(null);
  const [resolving, setResolving] = useState(false);

  const [claiming, setClaiming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [txError, setTxError] = useState('');

  const load = useCallback(async () => {
    if (!CONTRACTS.PREDICTION_MARKET) {
      setError('Contract not configured.');
      setLoading(false);
      return;
    }
    try {
      const [m, o] = await Promise.all([getMarket(Number(id)), getOdds(Number(id))]);
      setMarket(m);
      setOdds(o);
      if (isConnected && address) {
        const pos = await getPosition(Number(id), address);
        setPosition(pos);
      }
    } catch (e) {
      setError('Failed to load market: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [id, isConnected, address]);

  useEffect(() => { load(); }, [load]);

  const handleStake = async () => {
    if (!stakeAmount || !stakeSide || !isConnected) return;
    setTxError('');
    setTxHash('');
    try {
      const sats = btcToSats(parseFloat(stakeAmount));
      if (sats <= 0n) { setTxError('Amount too small'); return; }

      setStakeStep('approving');
      const txId = await approveAndStake(address, Number(id), stakeSide, sats, CONTRACTS.TEST_WBTC);
      setTxHash(txId);
      setStakeStep('done');
      setStakeAmount('');
      await load();
    } catch (e) {
      setTxError(e.message);
      setStakeStep('idle');
    }
  };

  const handleResolve = async () => {
    if (!resolveOutcome || !isConnected) return;
    setResolving(true);
    setTxError('');
    try {
      const txId = await resolveMarket(address, Number(id), resolveOutcome);
      setTxHash(txId);
      await load();
    } catch (e) {
      setTxError(e.message);
    } finally {
      setResolving(false);
    }
  };

  const handleClaim = async () => {
    setClaiming(true);
    setTxError('');
    try {
      const txId = await claimWinnings(address, Number(id));
      setTxHash(txId);
      await load();
    } catch (e) {
      setTxError(e.message);
    } finally {
      setClaiming(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    setTxError('');
    try {
      const txId = await cancelMarket(address, Number(id));
      setTxHash(txId);
      await load();
    } catch (e) {
      setTxError(e.message);
    } finally {
      setCancelling(false);
    }
  };

  const handleRefund = async () => {
    setClaiming(true);
    setTxError('');
    try {
      const txId = await refundStake(address, Number(id));
      setTxHash(txId);
      await load();
    } catch (e) {
      setTxError(e.message);
    } finally {
      setClaiming(false);
    }
  };

  if (loading) return <div className="page"><div className="center-msg">Loading market...</div></div>;
  if (error) return <div className="page"><div className="error-msg">{error}</div></div>;
  if (!market) return <div className="page"><div className="center-msg">Market not found.</div></div>;

  const label = outcomeLabel(market.outcome);
  const isOpen = market.outcome === OUTCOME.OPEN;
  const isResolved = market.outcome === OUTCOME.YES || market.outcome === OUTCOME.NO;
  const isCancelled = market.outcome === OUTCOME.CANCELLED;

  const yesP = odds ? Math.round(odds.yesPercent) : 50;
  const totalPool = (market.yesPool ?? 0n) + (market.noPool ?? 0n);

  const isResolver = address && market.resolver &&
    address.toLowerCase().includes(market.resolver.toLowerCase().slice(-8));

  const userWon = isResolved && position && (
    (market.outcome === OUTCOME.YES && position.yesStake > 0n) ||
    (market.outcome === OUTCOME.NO && position.noStake > 0n)
  );
  const canClaim = userWon && !position?.hasClaimed;
  const canRefund = isCancelled && position && (position.yesStake > 0n || position.noStake > 0n) && !position?.hasClaimed;

  // Estimate payout
  function estimatePayout() {
    if (!stakeAmount || !stakeSide || !market) return null;
    const amt = parseFloat(stakeAmount);
    if (isNaN(amt) || amt <= 0) return null;
    const amtSats = btcToSats(amt);
    const yesPool = Number(market.yesPool || 0n);
    const noPool = Number(market.noPool || 0n);
    const newYes = stakeSide === SIDE_YES ? yesPool + Number(amtSats) : yesPool;
    const newNo = stakeSide === SIDE_NO ? noPool + Number(amtSats) : noPool;
    const total = newYes + newNo;
    const fee = total * market.feeBps / 10000;
    const net = total - fee;
    const winPool = stakeSide === SIDE_YES ? newYes : newNo;
    if (winPool === 0) return null;
    const payout = (Number(amtSats) / winPool) * net;
    return { sats: Math.round(payout), btc: payout / 1e8 };
  }
  const payout = estimatePayout();

  return (
    <div className="page">
      <div className="detail-layout">
        {/* Left: Market Info */}
        <div className="detail-main">
          <Link to="/markets" className="back-link">← Back to Markets</Link>

          {/* Status + outcome banner */}
          {isResolved && (
            <div className={`outcome-banner ${market.outcome === OUTCOME.YES ? 'yes' : 'no'}`}>
              {market.outcome === OUTCOME.YES ? 'YES Won' : 'NO Won'}
            </div>
          )}
          {isCancelled && <div className="outcome-banner cancelled">Market Cancelled — Full Refunds Available</div>}

          <h1 className="detail-question">{market.question}</h1>
          {market.description && (
            <p className="detail-description">{market.description}</p>
          )}

          {/* Odds bar */}
          <div className="detail-odds">
            <div className="detail-odds-bar">
              <div className="odds-yes" style={{ width: `${yesP}%` }} />
            </div>
            <div className="odds-labels">
              <span className="yes-label">YES {yesP}%</span>
              <span className="no-label">NO {100 - yesP}%</span>
            </div>
          </div>

          {/* Pool stats */}
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-label">Total Volume</div>
              <div className="stat-value">{formatBtc(totalPool)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">YES Pool</div>
              <div className="stat-value yes-color">{formatBtc(market.yesPool)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">NO Pool</div>
              <div className="stat-value no-color">{formatBtc(market.noPool)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Fee</div>
              <div className="stat-value">{(market.feeBps / 100).toFixed(1)}%</div>
            </div>
          </div>

          {/* Market metadata */}
          <div className="meta-row">
            <span className="meta-item">End block: #{market.endBlock?.toString()}</span>
            <span className="meta-item">Resolution deadline: #{market.resolutionDeadline?.toString()}</span>
            {isOpen && <span className="meta-item">Time remaining: {blocksToApproxTime(Number(market.endBlock))}</span>}
          </div>

          {/* Your position */}
          {isConnected && position && (position.yesStake > 0n || position.noStake > 0n) && (
            <div className="position-card">
              <h3>Your Position</h3>
              <div className="position-row">
                {position.yesStake > 0n && (
                  <span className="yes-color">YES: {formatBtc(position.yesStake)}</span>
                )}
                {position.noStake > 0n && (
                  <span className="no-color">NO: {formatBtc(position.noStake)}</span>
                )}
                {position.hasClaimed && <span className="muted">Claimed</span>}
              </div>

              {canClaim && (
                <button className="btn btn-success" onClick={handleClaim} disabled={claiming}>
                  {claiming ? 'Claiming...' : 'Claim Winnings'}
                </button>
              )}
              {canRefund && (
                <button className="btn btn-secondary" onClick={handleRefund} disabled={claiming}>
                  {claiming ? 'Refunding...' : 'Refund Stake'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Action Panel */}
        <div className="detail-sidebar">

          {/* Stake panel */}
          {isOpen && isConnected && (
            <div className="action-card">
              <h3>Place a Bet</h3>
              <p className="action-hint">Approve wBTC, then stake. Two transactions.</p>

              <div className="side-selector">
                <button
                  className={`side-btn yes-btn ${stakeSide === SIDE_YES ? 'active' : ''}`}
                  onClick={() => setStakeSide(SIDE_YES)}
                >
                  YES {yesP}%
                </button>
                <button
                  className={`side-btn no-btn ${stakeSide === SIDE_NO ? 'active' : ''}`}
                  onClick={() => setStakeSide(SIDE_NO)}
                >
                  NO {100 - yesP}%
                </button>
              </div>

              <div className="input-row">
                <input
                  type="number"
                  className="amount-input"
                  placeholder="0.001"
                  min="0.000001"
                  step="0.000001"
                  value={stakeAmount}
                  onChange={e => setStakeAmount(e.target.value)}
                />
                <span className="input-unit">wBTC</span>
              </div>

              {payout && stakeSide && (
                <div className="payout-estimate">
                  Estimated payout: <strong>{payout.btc.toFixed(6)} wBTC</strong>
                  {' '}({((payout.btc / parseFloat(stakeAmount) - 1) * 100).toFixed(1)}% return)
                </div>
              )}

              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={!stakeSide || !stakeAmount || stakeStep !== 'idle'}
                onClick={handleStake}
              >
                {stakeStep === 'approving' ? 'Step 1: Approving wBTC...' :
                 stakeStep === 'staking' ? 'Step 2: Staking...' :
                 stakeStep === 'done' ? 'Staked!' :
                 stakeSide === SIDE_YES ? 'Bet YES' :
                 stakeSide === SIDE_NO ? 'Bet NO' :
                 'Select a side'}
              </button>

              {stakeStep === 'done' && (
                <button className="btn btn-secondary" style={{ width: '100%', marginTop: '0.5rem' }}
                  onClick={() => setStakeStep('idle')}>
                  Bet Again
                </button>
              )}
            </div>
          )}

          {!isConnected && isOpen && (
            <div className="action-card">
              <p className="center-msg">Connect wallet to place a bet.</p>
            </div>
          )}

          {/* Resolver panel */}
          {isOpen && isResolver && (
            <div className="action-card resolver-card">
              <h3>Resolve Market</h3>
              <p className="action-hint">Only available after end block.</p>
              <div className="side-selector">
                <button
                  className={`side-btn yes-btn ${resolveOutcome === OUTCOME.YES ? 'active' : ''}`}
                  onClick={() => setResolveOutcome(OUTCOME.YES)}
                >
                  YES Won
                </button>
                <button
                  className={`side-btn no-btn ${resolveOutcome === OUTCOME.NO ? 'active' : ''}`}
                  onClick={() => setResolveOutcome(OUTCOME.NO)}
                >
                  NO Won
                </button>
              </div>
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={!resolveOutcome || resolving}
                onClick={handleResolve}
              >
                {resolving ? 'Resolving...' : 'Resolve Market'}
              </button>
              <button
                className="btn btn-secondary"
                style={{ width: '100%', marginTop: '0.5rem' }}
                disabled={cancelling}
                onClick={handleCancel}
              >
                {cancelling ? 'Cancelling...' : 'Cancel Market'}
              </button>
            </div>
          )}

          {/* Cancel by deadline */}
          {isOpen && !isResolver && isConnected && (
            <div className="action-card">
              <p className="action-hint muted">
                If the resolver misses the deadline (block #{market.resolutionDeadline?.toString()}),
                anyone can cancel and all stakers receive a full refund.
              </p>
              <button
                className="btn btn-secondary"
                style={{ width: '100%' }}
                disabled={cancelling}
                onClick={handleCancel}
              >
                {cancelling ? 'Cancelling...' : 'Cancel (after deadline)'}
              </button>
            </div>
          )}

          {/* Tx feedback */}
          {txHash && (
            <div className="tx-success">
              Transaction sent: <br />
              <span className="tx-hash">{txHash.slice(0, 20)}...</span>
            </div>
          )}
          {txError && <div className="tx-error">{txError}</div>}
        </div>
      </div>
    </div>
  );
}
