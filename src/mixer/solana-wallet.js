import { getWallets } from '@wallet-standard/app';
import { createSignerFromWalletAccount } from '@umbra-privacy/sdk';

// ── WALLET DETECTION ──

/**
 * Detects available Solana wallets via the Wallet Standard registry.
 * Returns an array of { name, provider } where `provider` is the
 * Wallet Standard wallet object. The field is named `provider` for
 * backward-compatibility with the existing UI layer (mixer-modal.js)
 * which passes `wallet.provider` to stepConnectSource.
 */
export function detectSolanaWallets() {
  const { get } = getWallets();
  const allWallets = get();

  // Keep only wallets that support the Solana signing features
  // required by the Umbra SDK.
  return allWallets
    .filter((w) => {
      const features = Object.keys(w.features);
      return (
        features.includes('solana:signTransaction') &&
        features.includes('solana:signMessage')
      );
    })
    .map((w) => ({ name: w.name, provider: w }));
}

// ── WALLET CONNECTION ──

/**
 * Connects to a Solana wallet via the Wallet Standard interface
 * and returns an IUmbraSigner created by the SDK.
 *
 * @param {import('@wallet-standard/core').Wallet} wallet  Wallet Standard wallet object
 * @returns {{ address: string, signer: import('@umbra-privacy/sdk').IUmbraSigner }}
 */
export async function connectSolanaWallet(wallet) {
  // Use the Wallet Standard "standard:connect" feature
  const connectFeature = wallet.features['standard:connect'];
  if (!connectFeature) {
    throw new Error('Wallet does not support the standard:connect feature');
  }

  const { accounts } = await connectFeature.connect();
  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts returned from wallet');
  }

  const account = accounts[0];

  // Create an IUmbraSigner using the SDK's Wallet Standard adapter.
  // This handles the Solana Kit v2 transaction format internally.
  const signer = createSignerFromWalletAccount(wallet, account);

  return { address: signer.address, signer };
}
