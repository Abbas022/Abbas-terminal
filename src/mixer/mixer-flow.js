import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';

import { STEP } from './mixer-state.js';
import * as state from './mixer-state.js';
import { connectSolanaWallet, createExternalWalletSigner } from './solana-wallet.js';
import {
  TOKENS,
  generateFreshWallet,
  createSourceUmbraClient,
  createFreshUmbraClient,
  registerUser,
  depositIntoEncryptedBalance,
  createSelfClaimableUtxo,
  claimUtxo,
  withdrawToPublicBalance,
} from './umbra-client.js';

// ── INDIVIDUAL STEP FUNCTIONS ──

export async function stepConnectSource(provider) {
  state.setCurrentStep(STEP.CONNECT);
  const { publicKey, provider: p } = await connectSolanaWallet(provider);
  state.setSourcePublicKey(publicKey);
  state.setSourceProvider(p);
  return publicKey;
}

export function stepSelectToken(token, amount) {
  state.setCurrentStep(STEP.SELECT);
  state.setSelectedToken(token);
  state.setSelectedAmount(amount);
}

async function stepGenerateFresh() {
  state.setCurrentStep(STEP.GENERATE);
  const { signer, publicKey, privateKey } = await generateFreshWallet();
  state.setFreshSigner(signer);
  state.setFreshPublicKey(publicKey);
  state.setFreshPrivateKey(privateKey);
  return { publicKey, privateKeyBase58: bs58.encode(privateKey) };
}

async function stepRegisterSource() {
  state.setCurrentStep(STEP.REGISTER_SOURCE);
  const signer = createExternalWalletSigner(state.sourceProvider, state.sourcePublicKey);
  const client = await createSourceUmbraClient(signer);
  state.setSourceUmbraClient(client);
  const sig = await registerUser(client);
  state.setTxSignatures([...state.txSignatures, sig]);
  return sig;
}

async function stepRegisterFresh() {
  state.setCurrentStep(STEP.REGISTER_FRESH);
  const client = await createFreshUmbraClient(state.freshSigner);
  state.setFreshUmbraClient(client);
  const sig = await registerUser(client);
  state.setTxSignatures([...state.txSignatures, sig]);
  return sig;
}

async function stepDeposit() {
  state.setCurrentStep(STEP.DEPOSIT);
  const token = TOKENS[state.selectedToken];
  const amount = parseAmount(state.selectedAmount, token.decimals);
  const sig = await depositIntoEncryptedBalance(state.sourceUmbraClient, token.mint, amount);
  state.setTxSignatures([...state.txSignatures, sig]);
  return sig;
}

async function stepCreateUtxo() {
  state.setCurrentStep(STEP.CREATE_UTXO);
  const token = TOKENS[state.selectedToken];
  const amount = parseAmount(state.selectedAmount, token.decimals);
  const sig = await createSelfClaimableUtxo(
    state.sourceUmbraClient,
    token.mint,
    amount,
    state.freshPublicKey,
  );
  state.setTxSignatures([...state.txSignatures, sig]);
  return sig;
}

async function stepClaimUtxo() {
  state.setCurrentStep(STEP.CLAIM_UTXO);
  const token = TOKENS[state.selectedToken];
  const sig = await claimUtxo(state.freshUmbraClient, token.mint);
  state.setTxSignatures([...state.txSignatures, sig]);
  return sig;
}

async function stepWithdraw() {
  state.setCurrentStep(STEP.WITHDRAW);
  const token = TOKENS[state.selectedToken];
  const amount = parseAmount(state.selectedAmount, token.decimals);
  const sig = await withdrawToPublicBalance(state.freshUmbraClient, token.mint, amount);
  state.setTxSignatures([...state.txSignatures, sig]);
  return sig;
}

// ── PIPELINE ORCHESTRATOR ──

/**
 * Runs steps 3–9 sequentially. Calls onProgress(step, message) at each transition.
 * Returns { freshPublicKey, freshPrivateKeyBase58, txSignatures } on success.
 */
export async function executeMixerPipeline(onProgress) {
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
    freshPublicKey: state.freshPublicKey.toString(),
    freshPrivateKeyBase58: bs58.encode(state.freshPrivateKey),
    txSignatures: [...state.txSignatures],
  };
}

// ── HELPERS ──

function parseAmount(amountStr, decimals) {
  const num = parseFloat(amountStr);
  if (isNaN(num) || num <= 0) throw new Error('Invalid amount');
  // Convert to smallest unit (lamports for SOL, micro-units for SPL)
  return BigInt(Math.round(num * 10 ** decimals));
}
