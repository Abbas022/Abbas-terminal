import { STEP } from './mixer-state.js';
import * as state from './mixer-state.js';

// Heavy deps loaded lazily on first use
let bs58, connectSolanaWallet;
let TOKENS, generateFreshWallet, createUmbraClient;
let registerUser, depositIntoEncryptedBalance, createSelfClaimableUtxo, claimUtxo, withdrawToPublicBalance;

async function loadDeps() {
  if (bs58) return; // already loaded
  const [bs58Mod, walletMod, umbraMod] = await Promise.all([
    import('bs58'),
    import('./solana-wallet.js'),
    import('./umbra-client.js'),
  ]);
  bs58 = bs58Mod.default;
  connectSolanaWallet = walletMod.connectSolanaWallet;
  TOKENS = umbraMod.TOKENS;
  generateFreshWallet = umbraMod.generateFreshWallet;
  createUmbraClient = umbraMod.createUmbraClient;
  registerUser = umbraMod.registerUser;
  depositIntoEncryptedBalance = umbraMod.depositIntoEncryptedBalance;
  createSelfClaimableUtxo = umbraMod.createSelfClaimableUtxo;
  claimUtxo = umbraMod.claimUtxo;
  withdrawToPublicBalance = umbraMod.withdrawToPublicBalance;
}

// ── INDIVIDUAL STEP FUNCTIONS ──

/**
 * Connects the source wallet via Wallet Standard.
 * @param {import('@wallet-standard/core').Wallet} wallet  Wallet Standard wallet object
 *   (passed as `wallet.provider` from the UI layer)
 * @returns {string} The wallet address (displayable)
 */
export async function stepConnectSource(wallet) {
  await loadDeps();
  state.setCurrentStep(STEP.CONNECT);

  // connectSolanaWallet returns { address: string, signer: IUmbraSigner }
  const { address, signer } = await connectSolanaWallet(wallet);

  // Store the address string in sourcePublicKey (UI checks truthiness & displays it)
  state.setSourcePublicKey(address);
  // Store the IUmbraSigner in sourceProvider (used later to create the Umbra client)
  state.setSourceProvider(signer);

  return address;
}

export function stepSelectToken(token, amount) {
  state.setCurrentStep(STEP.SELECT);
  state.setSelectedToken(token);
  state.setSelectedAmount(amount);
}

async function stepGenerateFresh() {
  state.setCurrentStep(STEP.GENERATE);

  // generateFreshWallet returns { signer, address, privateKey: Uint8Array(64) }
  const { signer, address, privateKey } = await generateFreshWallet();

  state.setFreshSigner(signer);
  state.setFreshPublicKey(address);
  state.setFreshPrivateKey(privateKey);

  return { publicKey: address, privateKeyBase58: bs58.encode(privateKey) };
}

async function stepRegisterSource() {
  state.setCurrentStep(STEP.REGISTER_SOURCE);

  // The source signer (IUmbraSigner) was stored by stepConnectSource.
  // Create an Umbra client directly from it — no wrapper needed.
  const client = await createUmbraClient(state.sourceProvider);
  state.setSourceUmbraClient(client);

  const sigs = await registerUser(client);
  state.setTxSignatures([...state.txSignatures, ...flatten(sigs)]);
  return sigs;
}

async function stepRegisterFresh() {
  state.setCurrentStep(STEP.REGISTER_FRESH);

  const client = await createUmbraClient(state.freshSigner);
  state.setFreshUmbraClient(client);

  const sigs = await registerUser(client);
  state.setTxSignatures([...state.txSignatures, ...flatten(sigs)]);
  return sigs;
}

async function stepDeposit() {
  state.setCurrentStep(STEP.DEPOSIT);
  const token = TOKENS[state.selectedToken];
  const amount = parseAmount(state.selectedAmount, token.decimals);

  const sig = await depositIntoEncryptedBalance(
    state.sourceUmbraClient,
    token.mint,
    amount,
  );
  state.setTxSignatures([...state.txSignatures, sig]);
  return sig;
}

async function stepCreateUtxo() {
  state.setCurrentStep(STEP.CREATE_UTXO);
  const token = TOKENS[state.selectedToken];
  const amount = parseAmount(state.selectedAmount, token.decimals);

  // state.freshPublicKey is the fresh wallet's address (base58 string)
  const sigs = await createSelfClaimableUtxo(
    state.sourceUmbraClient,
    token.mint,
    amount,
    state.freshPublicKey,
  );
  state.setTxSignatures([...state.txSignatures, ...flatten(sigs)]);
  return sigs;
}

async function stepClaimUtxo() {
  state.setCurrentStep(STEP.CLAIM_UTXO);

  // claimUtxo fetches UTXOs internally and returns an array of sigs
  const sigs = await claimUtxo(state.freshUmbraClient);
  state.setTxSignatures([...state.txSignatures, ...flatten(sigs)]);
  return sigs;
}

async function stepWithdraw() {
  state.setCurrentStep(STEP.WITHDRAW);
  const token = TOKENS[state.selectedToken];
  const amount = parseAmount(state.selectedAmount, token.decimals);

  const sig = await withdrawToPublicBalance(
    state.freshUmbraClient,
    token.mint,
    amount,
  );
  state.setTxSignatures([...state.txSignatures, sig]);
  return sig;
}

// ── PIPELINE ORCHESTRATOR ──

export async function executeMixerPipeline(onProgress) {
  await loadDeps();

  const steps = [
    { fn: stepGenerateFresh,  step: STEP.GENERATE,        msg: 'Generating fresh wallet...' },
    { fn: stepRegisterSource, step: STEP.REGISTER_SOURCE, msg: 'Registering source wallet with Umbra...' },
    { fn: stepRegisterFresh,  step: STEP.REGISTER_FRESH,  msg: 'Registering fresh wallet with Umbra...' },
    { fn: stepDeposit,        step: STEP.DEPOSIT,         msg: 'Depositing into encrypted balance (wallet will prompt to sign)...' },
    { fn: stepCreateUtxo,     step: STEP.CREATE_UTXO,     msg: 'Creating self-claimable UTXO (ZK proof — may take 30-60s)...' },
    { fn: stepClaimUtxo,      step: STEP.CLAIM_UTXO,      msg: 'Claiming UTXO into fresh wallet (ZK proof — may take 30-60s)...' },
    { fn: stepWithdraw,       step: STEP.WITHDRAW,        msg: 'Withdrawing to fresh wallet public balance...' },
  ];

  for (const { fn, step, msg } of steps) {
    onProgress(step, msg);
    try {
      await fn();
    } catch (err) {
      state.setCurrentStep(STEP.ERROR);
      state.setErrorMessage(`Failed at ${step}: ${err.message}`);
      throw err;
    }
  }

  state.setCurrentStep(STEP.COMPLETE);
  onProgress(STEP.COMPLETE, 'Mixing complete!');

  return {
    freshPublicKey: String(state.freshPublicKey),
    freshPrivateKeyBase58: bs58.encode(state.freshPrivateKey),
    txSignatures: [...state.txSignatures],
  };
}

// ── HELPERS ──

function parseAmount(amountStr, decimals) {
  const num = parseFloat(amountStr);
  if (isNaN(num) || num <= 0) throw new Error('Invalid amount');
  return BigInt(Math.round(num * 10 ** decimals));
}

/**
 * Normalizes a value that may be a single string or an array of strings
 * into a flat array, filtering out falsy entries.
 */
function flatten(val) {
  if (Array.isArray(val)) return val.filter(Boolean);
  return val ? [val] : [];
}
