import { PublicKey } from '@solana/web3.js';

// ── WALLET DETECTION ──

/**
 * Detects available Solana wallet browser extensions.
 * Returns an array of { name, provider } objects.
 */
export function detectSolanaWallets() {
  const wallets = [];

  if (window.phantom?.solana?.isPhantom) {
    wallets.push({ name: 'Phantom', provider: window.phantom.solana });
  }

  if (window.backpack?.solana) {
    wallets.push({ name: 'Backpack', provider: window.backpack.solana });
  }

  if (window.solflare?.isSolflare) {
    wallets.push({ name: 'Solflare', provider: window.solflare });
  }

  return wallets;
}

// ── WALLET CONNECTION ──

/**
 * Connects to a Solana wallet via its injected provider.
 * Returns { publicKey: PublicKey, provider }.
 */
export async function connectSolanaWallet(provider) {
  const resp = await provider.connect();
  const publicKey = resp.publicKey || provider.publicKey;
  if (!publicKey) throw new Error('Wallet did not return a public key');
  return { publicKey: new PublicKey(publicKey.toString()), provider };
}

// ── SIGNER WRAPPER ──

/**
 * Wraps an injected browser wallet provider into the signer shape
 * expected by the Umbra SDK: { publicKey, signTransaction, signAllTransactions }.
 */
export function createExternalWalletSigner(provider, publicKey) {
  return {
    publicKey,
    signTransaction: async (tx) => {
      return provider.signTransaction(tx);
    },
    signAllTransactions: async (txs) => {
      if (provider.signAllTransactions) {
        return provider.signAllTransactions(txs);
      }
      // Fallback: sign one by one
      return Promise.all(txs.map((tx) => provider.signTransaction(tx)));
    },
  };
}
