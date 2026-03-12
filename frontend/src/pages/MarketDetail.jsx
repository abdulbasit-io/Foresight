import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import {
  getMarket,
  getPosition,
  getOdds,
  getResolutionVotes,
  getAllowance,
  approveToken,
  stakePosition,
  resolveMarket,
  cancelMarket,
  claimWinnings,
  refundStake,
} from '../utils/contractService';
import { formatBtc, btcToSats, outcomeLabel, blocksToApproxTime } from '../utils/formatters';
import { OUTCOME, SIDE_YES, SIDE_NO, CONTRACTS, WBTC_DECIMALS } from '../utils/constants';
import { getBlockNumber } from '../utils/opnetProvider';

// Vote value constants (match contract: 0=none, 1=YES, 2=NO)
const VOTE_NONE = 0n;
const VOTE_YES  = 1n;
const VOTE_NO   = 2n;

function VoteBadge({ vote }) {
  if (!vote || vote === VOTE_NONE) return <span className="vote-badge vote-none">Not voted</span>;
  if (vote === VOTE_YES) return <span className="vote-badge vote-yes">YES</span>;
  return <span className="vote-badge vote-no">NO</span>;
}

// Mirror of the contract's claim() payout formula
function calcClaimPayout(market, pos) {
  if (!market || !pos) return 0n;
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

export default function MarketDetail() {
  const { id } = useParams();
  const { isConnected, address } = useWallet();

  const [market, setMarket]         = useState(null);
  const [odds, setOdds]             = useState(null);
  const [position, setPosition]     = useState(null);
  const [votes, setVotes]           = useState(null); // { resolverVote, platformVote }
  const [currentBlock, setCurrentBlock] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  // Stake UI
  const [stakeAmount, setStakeAmount] = useState('');
  const [stakeSide, setStakeSide]     = useState(null);
  const [stakeStep, setStakeStep]     = useState('idle'); // idle|approving|pending|staking|done
  const [allowance, setAllowance]     = useState(null);
  const [approvalChecks, setApprovalChecks] = useState(0);
  const [nextCheckIn, setNextCheckIn] = useState(null);

  const pollRef      = useRef(null);
  const countdownRef = useRef(null);

  // Resolve / cancel UI
  const [resolveOutcome, setResolveOutcome] = useState(null);
  const [resolving, setResolving]     = useState(false);
  const [cancelling, setCancelling]   = useState(false);

  // Claim / refund UI
  const [claiming, setClaiming]       = useState(false);
  const [claimDone, setClaimDone]     = useState(false);

  const [txHash, setTxHash]   = useState('');
  const [txError, setTxError] = useState('');

  // ── Polling helpers ────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollRef.current)      { clearInterval(pollRef.current);      pollRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setNextCheckIn(null);
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startPolling = useCallback((addr) => {
    stopPolling();
    const POLL_SECS = 30;
    setNextCheckIn(POLL_SECS);

    countdownRef.current = setInterval(() => {
      setNextCheckIn(n => (n != null && n > 1 ? n - 1 : POLL_SECS));
    }, 1000);

    pollRef.current = setInterval(async () => {
      setNextCheckIn(POLL_SECS);
      setApprovalChecks(c => c + 1);
      const current = await getAllowance(addr);
      if (current > 0n) {
        setAllowance(current);
        setStakeStep('idle');
        stopPolling();
      }
    }, POLL_SECS * 1000);
  }, [stopPolling]);

  const checkNow = useCallback(async () => {
    if (!address) return;
    setApprovalChecks(c => c + 1);
    const current = await getAllowance(address);
    if (current > 0n) {
      setAllowance(current);
      setStakeStep('idle');
      stopPolling();
    }
  }, [address, stopPolling]);

  // Check allowance on connect
  useEffect(() => {
    if (isConnected && address) getAllowance(address).then(setAllowance);
  }, [isConnected, address]);

  // ── Load ───────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!CONTRACTS.PREDICTION_MARKET) {
      setError('Contract not configured.');
      setLoading(false);
      return;
    }
    try {
      const [m, o, v, blk] = await Promise.all([
        getMarket(Number(id)),
        getOdds(Number(id)),
        getResolutionVotes(Number(id)),
        getBlockNumber(),
      ]);
      setMarket(m);
      setOdds(o);
      setVotes(v);
      if (blk != null) setCurrentBlock(Number(blk));
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

  // ── Handlers ───────────────────────────────────────────
  const handleApprove = async () => {
    setTxError('');
    setStakeStep('approving');
    try {
      await approveToken(address, CONTRACTS.TEST_WBTC);
      setApprovalChecks(0);
      setStakeStep('pending');
      startPolling(address);
    } catch (e) {
      setTxError(e.message);
      setStakeStep('idle');
    }
  };

  const handleStake = async () => {
    if (!stakeAmount || !stakeSide || !isConnected) return;
    setTxError('');
    setTxHash('');
    setStakeStep('staking');
    try {
      const sats = btcToSats(parseFloat(stakeAmount));
      if (sats <= 0n) { setTxError('Amount too small'); setStakeStep('idle'); return; }
      const txId = await stakePosition(address, Number(id), stakeSide, sats);
      setTxHash(txId);
      setStakeStep('done');
      setStakeAmount('');
      stopPolling();
      setAllowance(null);
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
      setClaimDone(true);
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
      setClaimDone(true);
      await load();
    } catch (e) {
      setTxError(e.message);
    } finally {
      setClaiming(false);
    }
  };

  // ── Render guards ──────────────────────────────────────
  if (loading) return <div className="page"><div className="center-msg">Loading market...</div></div>;
  if (error)   return <div className="page"><div className="error-msg">{error}</div></div>;
  if (!market) return <div className="page"><div className="center-msg">Market not found.</div></div>;

  const label      = outcomeLabel(market.outcome);
  const isOpen     = market.outcome === OUTCOME.OPEN;
  const isResolved = market.outcome === OUTCOME.YES || market.outcome === OUTCOME.NO;
  const isCancelled = market.outcome === OUTCOME.CANCELLED;

  const yesP      = odds ? Math.round(odds.yesPercent) : 50;
  const totalPool = (market.yesPool ?? 0n) + (market.noPool ?? 0n);

  // Platform resolver check — compare wallet address against env var
  const isPlatformResolver = !!(
    address && CONTRACTS.PLATFORM_RESOLVER &&
    address.toLowerCase() === CONTRACTS.PLATFORM_RESOLVER.toLowerCase()
  );

  // Pending votes state
  const resolverVoted  = votes && votes.resolverVote  !== VOTE_NONE;
  const platformVoted  = votes && votes.platformVote  !== VOTE_NONE;
  const votesAgree     = votes && resolverVoted && platformVoted &&
                         votes.resolverVote === votes.platformVote;
  const votesDisagree  = votes && resolverVoted && platformVoted && !votesAgree;

  // Position
  const userWon  = isResolved && position && (
    (market.outcome === OUTCOME.YES && position.yesStake > 0n) ||
    (market.outcome === OUTCOME.NO  && position.noStake  > 0n)
  );
  const canClaim  = userWon && !position?.hasClaimed;
  const canRefund = isCancelled && position &&
    (position.yesStake > 0n || position.noStake > 0n) && !position?.hasClaimed;

  const estimatedPayout = canClaim ? calcClaimPayout(market, position) : 0n;

  // Estimate bet payout
  function estimateBetPayout() {
    if (!stakeAmount || !stakeSide || !market) return null;
    const amt = parseFloat(stakeAmount);
    if (isNaN(amt) || amt <= 0) return null;
    const amtSats  = btcToSats(amt);
    const yesPool  = Number(market.yesPool || 0n);
    const noPool   = Number(market.noPool  || 0n);
    const newYes   = stakeSide === SIDE_YES ? yesPool + Number(amtSats) : yesPool;
    const newNo    = stakeSide === SIDE_NO  ? noPool  + Number(amtSats) : noPool;
    const total    = newYes + newNo;
    const fee      = total * market.feeBps / 10000;
    const net      = total - fee;
    const winPool  = stakeSide === SIDE_YES ? newYes : newNo;
    if (winPool === 0) return null;
    const payout   = (Number(amtSats) / winPool) * net;
    return { sats: Math.round(payout), btc: payout / 1e8 };
  }
  const betPayout = estimateBetPayout();

  return (
    <div className="page">
      <div className="detail-layout">

        {/* ── Left: Market Info ─────────────────────────── */}
        <div className="detail-main">
          <Link to="/markets" className="back-link">← Back to Markets</Link>

          {isResolved && (
            <div className={`outcome-banner ${market.outcome === OUTCOME.YES ? 'yes' : 'no'}`}>
              {market.outcome === OUTCOME.YES ? 'YES Won' : 'NO Won'}
            </div>
          )}
          {isCancelled && (
            <div className="outcome-banner cancelled">Market Cancelled — Full Refunds Available</div>
          )}

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
            {isOpen && currentBlock != null && (
              <span className="meta-item">
                Time remaining: {blocksToApproxTime(Number(market.endBlock) - currentBlock)}
              </span>
            )}
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
              </div>

              {/* Win / Loss outcome label */}
              {isResolved && (
                <div style={{ marginTop: '0.5rem' }}>
                  {userWon
                    ? <span className="result-badge result-won">You Won</span>
                    : <span className="result-badge result-lost">You Lost</span>
                  }
                </div>
              )}

              {/* Estimated payout before claiming */}
              {canClaim && estimatedPayout > 0n && (
                <div className="payout-estimate" style={{ marginTop: '0.5rem' }}>
                  Est. payout: <strong>{formatBtc(estimatedPayout)} tWBTC</strong>
                  {' '}
                  <span className="muted">
                    ({(
                      ((Number(estimatedPayout) - Number(market.outcome === OUTCOME.YES ? position.yesStake : position.noStake)) /
                       Number(market.outcome === OUTCOME.YES ? position.yesStake : position.noStake)) * 100
                    ).toFixed(1)}% return)
                  </span>
                </div>
              )}

              {canClaim && (
                <button className="btn btn-success" onClick={handleClaim}
                  disabled={claiming} style={{ marginTop: '0.75rem' }}>
                  {claiming ? 'Claiming...' : 'Claim Winnings'}
                </button>
              )}
              {canRefund && (
                <button className="btn btn-secondary" onClick={handleRefund}
                  disabled={claiming} style={{ marginTop: '0.75rem' }}>
                  {claiming ? 'Refunding...' : 'Refund Stake'}
                </button>
              )}
              {claimDone && (
                <div className="bet-confirmed-note" style={{ marginTop: '0.5rem' }}>
                  {canRefund
                    ? 'Refund sent — arrives in your wallet after the next Bitcoin block (~10 min).'
                    : 'Winnings sent — arrives in your wallet after the next Bitcoin block (~10 min).'}
                </div>
              )}
              {position.hasClaimed && !claimDone && (
                <span className="muted" style={{ display: 'block', marginTop: '0.5rem' }}>
                  Settled
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Right: Action Panel ───────────────────────── */}
        <div className="detail-sidebar">

          {/* Token requirement notice */}
          {isOpen && (
            <div className="token-required-strip">
              <span className="token-required-icon">ℹ</span>
              <span>
                Betting requires <strong>tWBTC</strong> — the testnet token.{' '}
                {isConnected
                  ? <>Go to <Link to="/markets" className="link">Markets</Link> to mint free tWBTC from the faucet, then come back to bet.</>
                  : <>Connect OPWallet, then mint free tWBTC from the faucet on the Markets page.</>}
              </span>
            </div>
          )}

          {/* Bet panel */}
          {isOpen && isConnected && (
            <div className="action-card">
              <h3>Place a Bet</h3>

              <div className="side-selector">
                <button
                  className={`side-btn yes-btn ${stakeSide === SIDE_YES ? 'active' : ''}`}
                  onClick={() => setStakeSide(SIDE_YES)}
                >YES {yesP}%</button>
                <button
                  className={`side-btn no-btn ${stakeSide === SIDE_NO ? 'active' : ''}`}
                  onClick={() => setStakeSide(SIDE_NO)}
                >NO {100 - yesP}%</button>
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
                <span className="input-unit">tWBTC</span>
              </div>

              {betPayout && stakeSide && (
                <div className="payout-estimate">
                  Est. payout: <strong>{betPayout.btc.toFixed(6)} tWBTC</strong>
                  {' '}({((betPayout.btc / parseFloat(stakeAmount) - 1) * 100).toFixed(1)}% return)
                </div>
              )}

              {/* Step 1: Approve */}
              {allowance === 0n && stakeStep !== 'pending' && (
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%', marginBottom: '0.75rem' }}
                  disabled={stakeStep === 'approving'}
                  onClick={handleApprove}
                >
                  {stakeStep === 'approving' ? 'Waiting for wallet...' : 'Step 1: Approve tWBTC (one-time)'}
                </button>
              )}

              {/* Pending approval confirmation */}
              {stakeStep === 'pending' && (
                <div className="approval-pending-card" style={{ marginBottom: '0.75rem' }}>
                  <div className="approval-pending-header">
                    <span className="approval-spinner" />
                    <strong>Approval sent — waiting for Bitcoin confirmation</strong>
                  </div>
                  <p className="approval-pending-sub">
                    Bitcoin blocks confirm every ~10 minutes. This page checks automatically
                    every 30 seconds and will unlock betting the moment it confirms.
                  </p>
                  <div className="approval-pending-status">
                    <span className="approval-check-count">
                      {approvalChecks === 0
                        ? 'First check in 30s...'
                        : `Checked ${approvalChecks} time${approvalChecks > 1 ? 's' : ''}`}
                    </span>
                    {nextCheckIn != null && (
                      <span className="approval-next-check">Next check in {nextCheckIn}s</span>
                    )}
                  </div>
                  <button
                    className="btn btn-secondary"
                    style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.85rem' }}
                    onClick={checkNow}
                  >
                    Check now
                  </button>
                </div>
              )}

              {/* Step 2: Stake */}
              {(allowance == null || allowance > 0n) && stakeStep !== 'pending' && (
                <>
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    disabled={!stakeSide || !stakeAmount || stakeStep === 'staking' || stakeStep === 'done'}
                    onClick={handleStake}
                  >
                    {stakeStep === 'staking' ? 'Staking...' :
                     stakeStep === 'done'    ? '✓ Staked!' :
                     stakeSide === SIDE_YES  ? 'Bet YES' :
                     stakeSide === SIDE_NO   ? 'Bet NO' :
                     'Select a side'}
                  </button>
                  {stakeStep === 'done' && (
                    <>
                      <div className="bet-confirmed-note">
                        Bet placed. Bitcoin blocks confirm every ~10 minutes — your position
                        will appear once the transaction is mined.
                      </div>
                      <button
                        className="btn btn-secondary"
                        style={{ width: '100%', marginTop: '0.5rem' }}
                        onClick={() => { setStakeStep('idle'); setStakeAmount(''); setTxHash(''); }}
                      >
                        Bet Again
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {!isConnected && isOpen && (
            <div className="action-card">
              <p className="center-msg">Connect wallet to place a bet.</p>
            </div>
          )}

          {/* Resolution panel — shown to connected users on OPEN markets */}
          {isOpen && isConnected && (
            <div className="action-card resolver-card">
              <h3>Resolution</h3>

              {/* Vote status — visible to everyone */}
              <div className="vote-status">
                <div className="vote-row">
                  <span className="vote-label">Market Resolver</span>
                  <VoteBadge vote={votes?.resolverVote} />
                </div>
                <div className="vote-row">
                  <span className="vote-label">
                    Platform
                    {isPlatformResolver && (
                      <span className="vote-you-badge"> (you)</span>
                    )}
                  </span>
                  <VoteBadge vote={votes?.platformVote} />
                </div>
              </div>

              {votesDisagree && (
                <p className="vote-disagree-note">
                  Resolvers disagree — either party can re-vote to change their position.
                </p>
              )}
              {votesAgree && (
                <p className="vote-agree-note">
                  Both resolvers agree — market will finalize on the next confirmation.
                </p>
              )}
              {!votesAgree && (
                <p className="action-hint">Both resolvers must agree to finalize the outcome.</p>
              )}

              {/* Vote submission */}
              <div className="side-selector" style={{ marginTop: '0.75rem' }}>
                <button
                  className={`side-btn yes-btn ${resolveOutcome === OUTCOME.YES ? 'active' : ''}`}
                  onClick={() => setResolveOutcome(OUTCOME.YES)}
                >YES Won</button>
                <button
                  className={`side-btn no-btn ${resolveOutcome === OUTCOME.NO ? 'active' : ''}`}
                  onClick={() => setResolveOutcome(OUTCOME.NO)}
                >NO Won</button>
              </div>
              <button
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '0.5rem' }}
                disabled={!resolveOutcome || resolving}
                onClick={handleResolve}
              >
                {resolving ? 'Submitting vote...' : 'Submit Vote'}
              </button>
              <p className="action-hint" style={{ marginTop: '0.4rem' }}>
                Only authorized resolvers can vote. Transaction will fail otherwise.
              </p>

              <button
                className="btn btn-secondary"
                style={{ width: '100%', marginTop: '0.5rem' }}
                disabled={cancelling}
                onClick={handleCancel}
              >
                {cancelling ? 'Cancelling...' : 'Cancel Market'}
              </button>
              {!isPlatformResolver && (
                <p className="action-hint">
                  Non-resolvers can cancel only after deadline (block #{market.resolutionDeadline?.toString()}).
                </p>
              )}
            </div>
          )}

          {/* Tx feedback */}
          {txHash && stakeStep !== 'done' && (
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
