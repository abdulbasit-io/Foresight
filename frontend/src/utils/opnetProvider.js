import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const RPC_URL = 'https://testnet.opnet.org';

let providerInstance = null;

export function getProvider() {
  if (!providerInstance) {
    try {
      providerInstance = new JSONRpcProvider(RPC_URL, networks.testnet);
    } catch (err) {
      console.warn('Failed to create OPNet provider:', err);
      providerInstance = null;
    }
  }
  return providerInstance;
}

export async function getBlockNumber() {
  const provider = getProvider();
  if (!provider) return null;
  try {
    return await provider.getBlockNumber();
  } catch {
    return null;
  }
}

export async function getBalance(address) {
  const provider = getProvider();
  if (!provider) return null;
  try {
    return await provider.getBalance(address);
  } catch {
    return null;
  }
}
