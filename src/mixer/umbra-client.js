import { Keypair } from '@solana/web3.js';
import {
  createSignerFromPrivateKeyBytes,
  getUmbraClientFromSigner,
  getUserRegistrationFunction,
  getDirectDepositIntoEncryptedBalanceFunction,
  getCreateSelfClaimableUtxoFromEncryptedBalanceFunction,
  getFetchClaimableUtxosFunction,
  getClaimSelfClaimableUtxoIntoPublicBalanceFunction,
  getDirectWithdrawIntoPublicBalanceV3Function,
  getUmbraRelayer,
} from '@umbra-privacy/sdk';

// ── CONFIG ──

const RPC_URL =
  import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const RPC_WS_URL =
  import.meta.env.VITE_SOLANA_RPC_WS_URL || 'wss://api.mainnet-beta.solana.com';
// SDK expects 'mainnet' | 'devnet' | 'localnet' (NOT 'mainnet-beta')
const NETWORK = import.meta.env.VITE_SOLANA_NETWORK || 'mainnet';
const INDEXER_ENDPOINT =
  import.meta.env.VITE_UMBRA_INDEXER_URL ||
  'https://acqzie0a1h.execute-api.eu-central-1.amazonaws.com';
const RELAYER_ENDPOINT =
  import.meta.env.VITE_UMBRA_RELAYER_URL || 'https://relayer.umbra.finance';

// Known token mints — SDK requires Address (base58 string) for all mints,
// including native SOL which uses the wrapped SOL mint.
export const TOKENS = {
  SOL: {
    symbol: 'SOL',
    mint: 'So11111111111111111111111111111111111111112',
    decimals: 9,
  },
  USDC: {
    symbol: 'USDC',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
  },
};

// ── ZK PROVERS (lazy loaded) ──
// The web-zk-prover package exports individual prover factory functions,
// one per circuit. Each is loaded on demand below.

let _registrationProver = null;
let _createUtxoProver = null;
let _claimUtxoProver = null;

async function getRegistrationProver() {
  if (!_registrationProver) {
    const { getUserRegistrationProver } = await import(
      '@umbra-privacy/web-zk-prover'
    );
    _registrationProver = getUserRegistrationProver();
  }
  return _registrationProver;
}

async function getCreateUtxoProver() {
  if (!_createUtxoProver) {
    const { getCreateSelfClaimableUtxoFromEncryptedBalanceProver } =
      await import('@umbra-privacy/web-zk-prover');
    _createUtxoProver =
      getCreateSelfClaimableUtxoFromEncryptedBalanceProver();
  }
  return _createUtxoProver;
}

async function getClaimUtxoProver() {
  if (!_claimUtxoProver) {
    const { getClaimSelfClaimableUtxoIntoPublicBalanceProver } = await import(
      '@umbra-privacy/web-zk-prover'
    );
    _claimUtxoProver =
      getClaimSelfClaimableUtxoIntoPublicBalanceProver();
  }
  return _claimUtxoProver;
}

// ── RELAYER (lazy loaded) ──

let _relayer = null;

function getRelayer() {
  if (!_relayer) {
    _relayer = getUmbraRelayer({ apiEndpoint: RELAYER_ENDPOINT });
  }
  return _relayer;
}

// ── FRESH WALLET GENERATION ──

/**
 * Generates a fresh in-memory Solana keypair and wraps it as an IUmbraSigner
 * using the SDK's `createSignerFromPrivateKeyBytes`.
 *
 * Returns { signer, address: string, privateKey: Uint8Array (64 bytes) }.
 *
 * - `signer.address` is the base58 public key (used as Address throughout the SDK).
 * - `privateKey` is the raw 64-byte Ed25519 key material for display/export.
 */
export async function generateFreshWallet() {
  // Use @solana/web3.js v1 Keypair to get raw 64-byte secretKey
  const keypair = Keypair.generate();
  const secretKey = keypair.secretKey; // Uint8Array(64)

  // Wrap into an IUmbraSigner via the SDK utility
  const signer = await createSignerFromPrivateKeyBytes(secretKey);

  return {
    signer,
    address: signer.address,
    privateKey: secretKey,
  };
}

// ── UMBRA CLIENT FACTORY ──

/**
 * Creates an Umbra client from any IUmbraSigner.
 * Works for both external wallet signers and in-memory keypair signers.
 */
export async function createUmbraClient(signer) {
  return getUmbraClientFromSigner({
    signer,
    network: NETWORK,
    rpcUrl: RPC_URL,
    rpcSubscriptionsUrl: RPC_WS_URL,
    indexerApiEndpoint: INDEXER_ENDPOINT,
  });
}

// ── SDK ACTION WRAPPERS ──
// All service functions are standalone factories imported from the SDK.
// They accept { client } as args and an optional deps object for
// ZK provers, relayers, etc.

/**
 * Registers a user with the Umbra protocol (account init, X25519 key, commitment).
 * Returns an array of transaction signatures.
 */
export async function registerUser(client) {
  const zkProver = await getRegistrationProver();
  const register = getUserRegistrationFunction(
    { client },
    { zkProver },
  );
  // Enable both confidential and anonymous mode for mixer usage
  const sigs = await register({ confidential: true, anonymous: true });
  return sigs;
}

/**
 * Deposits tokens from the user's public ATA into their Encrypted Token Account.
 * @param {IUmbraClient} client
 * @param {string} mint       Token mint address (base58)
 * @param {bigint} amount     Amount in smallest unit
 * @returns {Promise<string>} Transaction signature
 */
export async function depositIntoEncryptedBalance(client, mint, amount) {
  const deposit = getDirectDepositIntoEncryptedBalanceFunction({ client });
  const sig = await deposit(client.signer.address, mint, amount);
  return sig;
}

/**
 * Creates a self-claimable UTXO from the encrypted balance, directed at
 * the fresh wallet address.
 * @param {IUmbraClient} client
 * @param {string} mint
 * @param {bigint} amount
 * @param {string} destinationAddress  The fresh wallet's address
 * @returns {Promise<string[]>} Transaction signatures
 */
export async function createSelfClaimableUtxo(
  client,
  mint,
  amount,
  destinationAddress,
) {
  const zkProver = await getCreateUtxoProver();
  const createUtxo = getCreateSelfClaimableUtxoFromEncryptedBalanceFunction(
    { client },
    { zkProver },
  );
  const sigs = await createUtxo({ amount, destinationAddress, mint });
  return sigs;
}

/**
 * Fetches claimable UTXOs and claims the first batch of self-claimable
 * (ephemeral) UTXOs into the fresh wallet's public ATA.
 * @param {IUmbraClient} client
 * @returns {Promise<string[]>} Transaction signatures
 */
export async function claimUtxo(client) {
  // Fetch claimable UTXOs — start from tree 0, insertion index 0
  const fetchUtxos = getFetchClaimableUtxosFunction({ client });
  const result = await fetchUtxos(0, 0);

  // Combine all self-claimable UTXO arrays
  const selfClaimable = [
    ...(result.ephemeral || []),
    ...(result.publicEphemeral || []),
  ];

  if (selfClaimable.length === 0) {
    throw new Error('No claimable UTXOs found for fresh wallet');
  }

  const zkProver = await getClaimUtxoProver();
  const relayer = getRelayer();
  const claim = getClaimSelfClaimableUtxoIntoPublicBalanceFunction(
    { client },
    { zkProver, relayer },
  );

  const claimResult = await claim(selfClaimable);

  // Flatten signatures from all batches into a single array
  const allSigs = Object.values(claimResult.signatures).flat();
  return allSigs;
}

/**
 * Withdraws tokens from Encrypted Token Account to the public ATA.
 * @param {IUmbraClient} client
 * @param {string} mint
 * @param {bigint} amount
 * @returns {Promise<string>} Transaction signature
 */
export async function withdrawToPublicBalance(client, mint, amount) {
  const withdraw = getDirectWithdrawIntoPublicBalanceV3Function({ client });
  const sig = await withdraw(client.signer.address, mint, amount);
  return sig;
}
