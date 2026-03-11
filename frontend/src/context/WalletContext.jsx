import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { NETWORK, LINKS, CONTRACTS } from '../utils/constants';
import { getProvider, getBalance as providerGetBalance } from '../utils/opnetProvider';

const WalletContext = createContext(null);

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}

export function WalletProvider({ children }) {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState('');
  const [btcBalance, setBtcBalance] = useState(0);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  const isOPWalletAvailable = () => typeof window !== 'undefined' && !!window.opnet;

  const fetchBalance = useCallback(async (addr) => {
    if (!addr) return;
    try {
      if (isOPWalletAvailable()) {
        const walletBalance = await window.opnet.getBalance();
        if (walletBalance?.confirmed !== undefined) {
          setBtcBalance(walletBalance.confirmed / 1e8);
          return;
        }
      }
      const bal = await providerGetBalance(addr);
      if (bal !== null) setBtcBalance(Number(bal) / 1e8);
    } catch {}
  }, []);

  // Restore session on mount
  useEffect(() => {
    const saved = localStorage.getItem('btcpredict_wallet');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setIsConnected(true);
        setAddress(data.address);
        setBtcBalance(data.btcBalance || 0);
        fetchBalance(data.address);
      } catch {
        localStorage.removeItem('btcpredict_wallet');
      }
    }
  }, [fetchBalance]);

  const connect = useCallback(async () => {
    if (!isOPWalletAvailable()) {
      setShowInstallPrompt(true);
      return;
    }
    setIsConnecting(true);
    try {
      const accounts = await window.opnet.requestAccounts();
      if (accounts?.length > 0) {
        const addr = accounts[0];
        let bal = 0;
        try {
          const walletBalance = await window.opnet.getBalance();
          if (walletBalance?.confirmed !== undefined) {
            bal = walletBalance.confirmed / 1e8;
          } else {
            const provBal = await providerGetBalance(addr);
            if (provBal !== null) bal = Number(provBal) / 1e8;
          }
        } catch {}

        setAddress(addr);
        setBtcBalance(bal);
        setIsConnected(true);
        localStorage.setItem('btcpredict_wallet', JSON.stringify({ address: addr, btcBalance: bal, network: NETWORK }));
      }
    } catch (err) {
      console.error('OPWallet connection failed:', err);
      setShowInstallPrompt(true);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setIsConnected(false);
    setAddress('');
    setBtcBalance(0);
    localStorage.removeItem('btcpredict_wallet');
  }, []);

  const refreshBalance = useCallback(async () => {
    if (isConnected && address) await fetchBalance(address);
  }, [isConnected, address, fetchBalance]);

  const dismissInstallPrompt = useCallback(() => setShowInstallPrompt(false), []);

  const value = {
    isConnected,
    isConnecting,
    address,
    btcBalance,
    network: NETWORK,
    showInstallPrompt,
    connect,
    disconnect,
    refreshBalance,
    dismissInstallPrompt,
    isOPWalletInstalled: isOPWalletAvailable(),
    contractAddress: CONTRACTS.PREDICTION_MARKET,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}

      {showInstallPrompt && (
        <div className="modal-overlay" onClick={dismissInstallPrompt}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">OPWallet Required</h3>
              <button className="modal-close" onClick={dismissInstallPrompt}>x</button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>&#8383;</div>
              <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                BTC Predict requires <strong style={{ color: 'var(--color-accent)' }}>OPWallet</strong> to interact with Bitcoin L1.
              </p>
              <a
                href={LINKS.OPWALLET}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', marginBottom: '0.75rem' }}
              >
                Install OPWallet
              </a>
              <button className="btn btn-secondary" onClick={dismissInstallPrompt} style={{ width: '100%' }}>
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}
    </WalletContext.Provider>
  );
}
