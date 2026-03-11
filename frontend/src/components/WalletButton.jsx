import { useState, useRef, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import { formatAddress } from '../utils/formatters';

export default function WalletButton() {
  const { isConnected, isConnecting, address, btcBalance, connect, disconnect, refreshBalance } = useWallet();
  const [showDropdown, setShowDropdown] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setShowDropdown(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (isConnecting) {
    return <button className="btn btn-primary" disabled>Connecting...</button>;
  }

  if (isConnected) {
    return (
      <div style={{ position: 'relative' }} ref={ref}>
        <button
          className="btn btn-secondary wallet-btn"
          onClick={() => setShowDropdown(v => !v)}
        >
          <span className="wallet-dot" />
          <span className="wallet-info">{btcBalance.toFixed(4)} BTC</span>
          <span className="wallet-sep">|</span>
          <span className="wallet-addr">{formatAddress(address)}</span>
        </button>

        {showDropdown && (
          <div className="wallet-dropdown">
            <button className="dropdown-item" onClick={() => { refreshBalance(); setShowDropdown(false); }}>
              Refresh Balance
            </button>
            <div className="wallet-dropdown-divider" />
            <button className="dropdown-item wallet-disconnect" onClick={() => { disconnect(); setShowDropdown(false); }}>
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <button className="btn btn-primary" onClick={connect}>
      Connect Wallet
    </button>
  );
}
