import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <span className="landing-badge">⚡ Built on Bitcoin L1 via OPNet</span>
          <h1 className="landing-title">
            Predict the Future<br />
            <span className="gradient-text">on Bitcoin</span>
          </h1>
          <p className="landing-subtitle">
            Create and trade binary prediction markets settled directly on
            Bitcoin Layer 1. No bridges, no sidechains — just trustless,
            on-chain outcomes.
          </p>
          <div className="landing-ctas">
            <Link to="/markets" className="btn btn-primary btn-lg">Explore Markets</Link>
            <Link to="/create" className="btn btn-secondary btn-lg">Create a Market</Link>
          </div>
        </div>
      </section>

      {/* ── Stats Banner ──────────────────────────────────── */}
      <div className="stats-banner">
        <div className="stat-highlight">
          <div className="stat-highlight-value">100%</div>
          <div className="stat-highlight-label">On-Chain Settlement</div>
        </div>
        <div className="stat-highlight">
          <div className="stat-highlight-value">0</div>
          <div className="stat-highlight-label">Bridges Required</div>
        </div>
        <div className="stat-highlight">
          <div className="stat-highlight-value">2%</div>
          <div className="stat-highlight-label">Platform Fee</div>
        </div>
      </div>

      {/* ── Supported Tokens ──────────────────────────────── */}
      <div className="token-support-row">
        <span className="token-support-label">Bet with</span>
        <div className="token-chips">
          <div className="token-chip token-chip-live">
            <span className="token-chip-symbol">tWBTC</span>
            <span className="token-chip-status live">Live</span>
          </div>
          <div className="token-chip token-chip-soon">
            <span className="token-chip-symbol">$PILL</span>
            <span className="token-chip-status soon">Soon</span>
          </div>
          <div className="token-chip token-chip-soon">
            <span className="token-chip-symbol">$MOTO</span>
            <span className="token-chip-status soon">Soon</span>
          </div>
        </div>
      </div>

      {/* ── Features ──────────────────────────────────────── */}
      <section className="landing-section">
        <div className="section-header">
          <h2 className="section-title">Why Foresight?</h2>
          <p className="section-subtitle">Trustless prediction markets, natively on Bitcoin</p>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">🔗</div>
            <h3>Native Bitcoin L1</h3>
            <p>Every bet, payout, and resolution happens directly on the Bitcoin blockchain through OPNet smart contracts.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🛡️</div>
            <h3>Non-Custodial</h3>
            <p>Your funds stay in smart contracts. No centralized custody, no counterparty risk. You hold your keys.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">⚡</div>
            <h3>Binary Markets</h3>
            <p>Simple YES/NO markets with parimutuel pooling. Transparent odds, instant settlement on resolution.</p>
          </div>
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────── */}
      <section className="landing-section">
        <div className="section-header">
          <h2 className="section-title">How It Works</h2>
          <p className="section-subtitle">Three simple steps to start predicting</p>
        </div>

        <div className="steps-grid">
          <div className="step-card">
            <div className="step-number">1</div>
            <h3>Pick a Market</h3>
            <p>Browse open prediction markets or create your own with a custom question and resolver.</p>
          </div>
          <div className="step-card">
            <div className="step-number">2</div>
            <h3>Place Your Bet</h3>
            <p>Stake wBTC on YES or NO. Your share of the pool determines your potential payout.</p>
          </div>
          <div className="step-card">
            <div className="step-number">3</div>
            <h3>Claim Winnings</h3>
            <p>Once resolved, winners claim their proportional share of the total pool, minus a small fee.</p>
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────── */}
      <section className="cta-banner" style={{ marginBottom: '3rem' }}>
        <h2>Ready to bet on the future?</h2>
        <p>Connect your OPWallet and start trading prediction markets on Bitcoin.</p>
        <Link to="/markets" className="btn btn-primary btn-lg">Start Trading</Link>
      </section>
    </>
  );
}
