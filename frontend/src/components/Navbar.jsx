import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import WalletButton from './WalletButton';

export default function Navbar() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (path) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(path));

  const links = [
    { to: '/markets', label: 'Markets' },
    { to: '/create', label: 'Create' },
    { to: '/portfolio', label: 'Portfolio' },
  ];

  return (
    <>
      <nav className="navbar">
        <div className="navbar-inner">
          <Link to="/" className="navbar-logo">
            <span className="navbar-logo-icon">F</span>
            <span>Foresight</span>
          </Link>

          <div className="navbar-links">
            {links.map(l => (
              <Link
                key={l.to}
                to={l.to}
                className={isActive(l.to) ? 'navbar-link active' : 'navbar-link'}
              >
                {l.label}
              </Link>
            ))}
          </div>

          <WalletButton />

          <button
            className="hamburger"
            onClick={() => setMobileOpen(v => !v)}
            aria-label="Toggle navigation"
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      <div className={`mobile-drawer ${mobileOpen ? 'open' : ''}`}>
        {links.map(l => (
          <Link
            key={l.to}
            to={l.to}
            className={isActive(l.to) ? 'navbar-link active' : 'navbar-link'}
            onClick={() => setMobileOpen(false)}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </>
  );
}
