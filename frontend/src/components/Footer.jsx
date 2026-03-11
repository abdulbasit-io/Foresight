import { LINKS } from '../utils/constants';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <span className="navbar-logo-icon" style={{ width: 20, height: 20, fontSize: '0.625rem' }}>F</span>
          <span className="footer-name">Foresight</span>
          <span className="footer-tagline">Prediction markets on Bitcoin L1</span>
        </div>

        <div className="footer-links">
          <a href={LINKS.OPNET} target="_blank" rel="noopener noreferrer">OPNet</a>
          <a href={LINKS.DOCS} target="_blank" rel="noopener noreferrer">Docs</a>
          <a href={LINKS.FAUCET} target="_blank" rel="noopener noreferrer">Faucet</a>
          <a href={LINKS.DISCORD} target="_blank" rel="noopener noreferrer">Discord</a>
          <a href={LINKS.TWITTER} target="_blank" rel="noopener noreferrer">Twitter</a>
        </div>

        <p className="footer-legal">
          © 2026 Foresight · Testnet only · Use at your own risk
        </p>
      </div>
    </footer>
  );
}
