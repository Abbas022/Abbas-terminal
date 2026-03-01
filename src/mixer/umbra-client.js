import {
  createInMemorySigner,
  getUmbraClientFromSigner,
} from '@umbra-privacy/sdk';

// ── CONFIG ──

const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const NETWORK = import.meta.env.VITE_SOLANA_NETWORK || 'mainnet-beta';

// Known token mints
export const TOKENS = {
  SOL:  { symbol: 'SOL',  mint: null, decimals: 9 },
  USDC: { symbol: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
};

// ── ZK PROVER (lazy loaded) ──

let _prover = null;

async function getProver() {
  if (!_prover) {
    const { createWebZkProver } = await import('@umbra-privacy/web-zk-prover');
    _prover = await createWebZkProver();
  }
  return _prover;
}

// ── FRESH WALLET GENERATION ──

/**
 * Generates a fresh in-memory Solana keypair via the Umbra SDK.
 * Returns { signer, publicKey: PublicKey, privateKey: Uint8Array }.
 */
export async function generateFreshWallet() {
  const signer = await createInMemorySigner();
  return {
    signer,
    publicKey: signer.publicKey,
    privateKey: signer.secretKey,
  };
}

// ── UMBRA CLIENT FACTORIES ──

export async function createSourceUmbraClient(signer) {
  return getUmbraClientFromSigner({
    signer,
    rpcUrl: RPC_URL,
    network: NETWORK,
    prover: await getProver(),
  });
}

export async function createFreshUmbraClient(signer) {
  return getUmbraClientFromSigner({
    signer,
    rpcUrl: RPC_URL,
    network: NETWORK,
    prover: await getProver(),
  });
}

// ── SDK ACTION WRAPPERS ──

export async function registerUser(client) {
  const register = await client.getUserRegistrationFunction();
  const sig = await register();
  return sig;
}

export async function depositIntoEncryptedBalance(client, tokenMint, amount) {
  const deposit = await client.getDirectDepositIntoEncryptedBalanceFunction({
    tokenMint,
    amount,
  });
  const sig = await deposit();
  return sig;
}

export async function createSelfClaimableUtxo(client, tokenMint, amount, recipientPublicKey) {
  const create = await client.getCreateSelfClaimableUtxoFromEncryptedBalanceFunction({
    tokenMint,
    amount,
    recipientPublicKey,
  });
  const sig = await create();
  return sig;
}

export async function claimUtxo(client, tokenMint) {
  const fetchUtxos = await client.getFetchClaimableUtxosFunction({ tokenMint });
  const utxos = await fetchUtxos();
  if (!utxos || utxos.length === 0) {
    throw new Error('No claimable UTXOs found for fresh wallet');
  }

  const claim = await client.getClaimSelfClaimableUtxoIntoPublicBalanceFunction({
    utxo: utxos[0],
  });
  const sig = await claim();
  return sig;
}

export async function withdrawToPublicBalance(client, tokenMint, amount) {
  const withdraw = await client.getDirectWithdrawIntoPublicBalanceV3Function({
    tokenMint,
    amount,
  });
  const sig = await withdraw();
  return sig;
}
