import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import { createMarket } from '../utils/contractService';
import { getBlockNumber } from '../utils/opnetProvider';
import { CONTRACTS, BLOCKS_PER_DAY } from '../utils/constants';

export default function Create() {
  const { isConnected, address } = useWallet();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    question: '',
    description: '',
    resolver: '',
    paymentToken: CONTRACTS.TEST_WBTC || '',
    durationDays: '7',
    resolutionDays: '1',
    feeBpsOverride: '0',
  });
  const [submitting, setSubmitting] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState('');
  const [currentBlock, setCurrentBlock] = useState(null);

  // Load current block for reference
  useEffect(() => {
    getBlockNumber().then(b => setCurrentBlock(b != null ? Number(b) : null));
  }, []);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  const endBlock = currentBlock
    ? currentBlock + parseInt(form.durationDays) * BLOCKS_PER_DAY
    : null;

  const resolutionDelta = parseInt(form.resolutionDays) * BLOCKS_PER_DAY;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isConnected) { setError('Connect wallet first.'); return; }
    if (!form.question.trim()) { setError('Question is required.'); return; }
    if (!form.resolver.trim()) { setError('Resolver address is required.'); return; }
    if (!form.paymentToken.trim()) { setError('Payment token is required.'); return; }
    if (!currentBlock) { setError('Could not fetch current block. Try again.'); return; }

    setSubmitting(true);
    setError('');
    setTxHash('');

    try {
      const txId = await createMarket(address, {
        question: form.question.trim(),
        description: form.description.trim(),
        resolver: form.resolver.trim(),
        paymentToken: form.paymentToken.trim(),
        endBlock: endBlock,
        resolutionDeadlineDelta: resolutionDelta,
        feeBpsOverride: parseInt(form.feeBpsOverride) || 0,
      });
      setTxHash(txId);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!isConnected) {
    return (
      <div className="page">
        <div className="center-card">
          <div className="center-card-icon">🔐</div>
          <h2>Connect Wallet</h2>
          <p className="muted">You need to connect OPWallet to create a market.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="form-page">
        <h1 className="page-title">Create a Market</h1>
        <p className="page-subtitle">
          Markets are resolved by a trusted resolver you designate. All bets are in wBTC (wrapped Bitcoin).
        </p>

        <form className="create-form" onSubmit={handleSubmit}>
          {/* Question */}
          <div className="form-group">
            <label className="form-label">Question *</label>
            <input
              className="form-input"
              type="text"
              maxLength={200}
              placeholder="Will BTC close above $150k before block 950,000?"
              value={form.question}
              onChange={e => set('question', e.target.value)}
              required
            />
            <span className="form-hint">{form.question.length}/200 characters</span>
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label">Resolution Criteria</label>
            <textarea
              className="form-input form-textarea"
              maxLength={500}
              placeholder="Describe exactly how this market will be resolved..."
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
            />
            <span className="form-hint">{form.description.length}/500 characters</span>
          </div>

          {/* Resolver */}
          <div className="form-group">
            <label className="form-label">Resolver (MLDSA public key) *</label>
            <input
              className="form-input"
              type="text"
              placeholder="0x..."
              value={form.resolver}
              onChange={e => set('resolver', e.target.value)}
              required
            />
            <span className="form-hint">
              Enter your MLDSA public key hash (0x...) — this is the only address allowed to resolve this market.
            </span>
          </div>

          {/* Payment Token — locked to TestWBTC */}
          <div className="form-group">
            <label className="form-label">Payment Token</label>
            <input
              className="form-input"
              type="text"
              value={form.paymentToken}
              readOnly
              style={{ opacity: 0.5, cursor: 'not-allowed', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}
            />
            <span className="form-hint">TestWBTC — the only supported token on testnet</span>
          </div>

          {/* Duration */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Betting Duration (days)</label>
              <input
                className="form-input"
                type="number"
                min="1"
                max="365"
                value={form.durationDays}
                onChange={e => set('durationDays', e.target.value)}
              />
              <span className="form-hint">
                {endBlock ? `End block: ~#${endBlock.toLocaleString()}` : 'Loading current block...'}
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Resolution Window (days)</label>
              <input
                className="form-input"
                type="number"
                min="1"
                max="30"
                value={form.resolutionDays}
                onChange={e => set('resolutionDays', e.target.value)}
              />
              <span className="form-hint">Days after end block for resolver to act</span>
            </div>
          </div>

          {/* Fee override */}
          <div className="form-group">
            <label className="form-label">Fee Override (basis points, 0 = use platform default 2%)</label>
            <input
              className="form-input"
              type="number"
              min="0"
              max="1000"
              value={form.feeBpsOverride}
              onChange={e => set('feeBpsOverride', e.target.value)}
            />
          </div>

          {error && <div className="tx-error">{error}</div>}
          {txHash && (
            <div className="tx-success">
              Market created! Tx: {txHash.slice(0, 20)}...<br />
              Bitcoin blocks take ~10 min — your market will appear on the Markets page in <strong>~15 minutes</strong> once the transaction is confirmed and indexed.
            </div>
          )}

          <button
            type={txHash ? 'button' : 'submit'}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.875rem' }}
            disabled={submitting}
            onClick={txHash ? () => navigate('/markets') : undefined}
          >
            {submitting ? 'Creating Market...' : txHash ? 'Go to Markets' : 'Create Market'}
          </button>
        </form>
      </div>
    </div>
  );
}
