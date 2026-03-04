import { STEP, PIPELINE_STEPS, STEP_LABELS } from './mixer-state.js';
import * as state from './mixer-state.js';

// Heavy deps lazy-loaded on first render
let detectSolanaWallets, stepConnectSource, stepSelectToken, executeMixerPipeline;

async function loadMixerDeps() {
  if (detectSolanaWallets) return;
  const [walletMod, flowMod] = await Promise.all([
    import('./solana-wallet.js'),
    import('./mixer-flow.js'),
  ]);
  detectSolanaWallets = walletMod.detectSolanaWallets;
  stepConnectSource = flowMod.stepConnectSource;
  stepSelectToken = flowMod.stepSelectToken;
  executeMixerPipeline = flowMod.executeMixerPipeline;
}

function shortenAddress(addr) {
  const s = addr.toString();
  return s.slice(0, 6) + '\u2026' + s.slice(-4);
}

/** SVG shield icon used in the page header */
const SHIELD_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;

/** Wallet brand icons (inline SVG for zero external deps) */
const WALLET_ICONS = {
  Phantom: `<svg class="wallet-icon" viewBox="0 0 128 128" fill="none"><defs><linearGradient id="pg" x1="0" y1="0" x2="128" y2="128" gradientUnits="userSpaceOnUse"><stop stop-color="#534bb1"/><stop offset="1" stop-color="#551bf9"/></linearGradient></defs><rect width="128" height="128" rx="26" fill="url(#pg)"/><path d="M100.5 54.3c-1.5 0-2.7 1.2-2.7 2.7s1.2 2.7 2.7 2.7 2.7-1.2 2.7-2.7-1.2-2.7-2.7-2.7zm-14 0c-1.5 0-2.7 1.2-2.7 2.7s1.2 2.7 2.7 2.7 2.7-1.2 2.7-2.7-1.2-2.7-2.7-2.7zm-14 0c-1.5 0-2.7 1.2-2.7 2.7s1.2 2.7 2.7 2.7 2.7-1.2 2.7-2.7-1.2-2.7-2.7-2.7zM110 45.4H59.8c-16.7 0-30.3 13.6-30.3 30.3 0 .4.3.7.7.7h6.5c.4 0 .7-.3.7-.7 0-12.3 10-22.4 22.4-22.4H110c.4 0 .7-.3.7-.7v-6.5c0-.4-.3-.7-.7-.7z" fill="#fff"/></svg>`,
  Backpack: `<svg class="wallet-icon" viewBox="0 0 128 128" fill="none"><rect width="128" height="128" rx="26" fill="#e33e3f"/><path d="M88 58H40a8 8 0 0 0-8 8v24a8 8 0 0 0 8 8h48a8 8 0 0 0 8-8V66a8 8 0 0 0-8-8zm-4 24H44v-8h40v8zM76 38H52a12 12 0 0 0-12 12v4h48v-4a12 12 0 0 0-12-12z" fill="#fff"/></svg>`,
  Solflare: `<svg class="wallet-icon" viewBox="0 0 128 128" fill="none"><rect width="128" height="128" rx="26" fill="#fc8c19"/><circle cx="64" cy="64" r="28" fill="#fff"/><circle cx="64" cy="64" r="14" fill="#fc8c19"/></svg>`,
};

/** Fallback wallet icon */
const WALLET_ICON_DEFAULT = `<svg class="wallet-icon" viewBox="0 0 128 128" fill="none"><rect width="128" height="128" rx="26" fill="#2a3448"/><path d="M88 46H40a6 6 0 0 0-6 6v24a6 6 0 0 0 6 6h48a6 6 0 0 0 6-6V52a6 6 0 0 0-6-6zm-4 24H44V56h40v14zM82 86H46v-4h36v4z" fill="#7a8599"/></svg>`;

/** Token icons */
const TOKEN_ICONS = {
  SOL: `<svg class="token-icon" viewBox="0 0 32 32"><defs><linearGradient id="sg1" x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse"><stop stop-color="#9945ff"/><stop offset="0.5" stop-color="#8752f3"/><stop offset="1" stop-color="#14f195"/></linearGradient></defs><circle cx="16" cy="16" r="16" fill="url(#sg1)"/><path d="M9.5 19.7l1.7-1.8c.1-.1.3-.2.5-.2h11.6c.3 0 .5.4.3.6l-1.7 1.8c-.1.1-.3.2-.5.2H9.8c-.3 0-.5-.4-.3-.6zm1.7-5.5c.1-.1.3-.2.5-.2h11.6c.3 0 .5.4.3.6l-1.7 1.8c-.1.1-.3.2-.5.2H9.8c-.3 0-.5-.4-.3-.6l1.7-1.8zm10.4-2.4l-1.7-1.8c-.1-.1-.3-.2-.5-.2H7.8c-.3 0-.5.4-.3.6l1.7 1.8c.1.1.3.2.5.2h11.6c.3 0 .5-.4.3-.6z" fill="#fff"/></svg>`,
  USDC: `<svg class="token-icon" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#2775ca"/><path d="M20.5 18.5c0-2-1.2-2.7-3.6-3-.8-.1-1.6-.3-2.1-.5-.6-.3-.9-.7-.9-1.3 0-.7.6-1.2 1.5-1.2s1.6.4 1.8 1.1c0 .2.2.3.4.3h.8c.2 0 .4-.2.3-.4-.2-1.2-1.1-2.1-2.3-2.3v-1.3c0-.2-.2-.4-.4-.4h-.7c-.2 0-.4.2-.4.4v1.3c-1.5.2-2.5 1.3-2.5 2.6 0 1.9 1.2 2.6 3.6 2.9.9.2 1.5.4 2 .7.4.3.6.7.6 1.2 0 .8-.7 1.4-1.7 1.4-1.3 0-1.8-.5-2-1.2 0-.2-.2-.3-.4-.3h-.9c-.2 0-.3.2-.3.4.3 1.3 1.2 2.2 2.6 2.4v1.3c0 .2.2.4.4.4h.7c.2 0 .4-.2.4-.4v-1.3c1.5-.3 2.5-1.4 2.5-2.8z" fill="#fff"/></svg>`,
};

/** Checkmark SVG for completed steps and success icon */
const CHECK_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

export async function renderMixerPage(container) {
  await loadMixerDeps();
  const wallets = detectSolanaWallets();

  container.innerHTML = `
    <div class="mixer-page">

      <!-- Page Header -->
      <div class="mixer-page-header">
        <div class="mixer-page-brand">
          <div class="mixer-page-logo">${SHIELD_ICON}</div>
          <div class="mixer-page-title">Solana Privacy Mixer</div>
        </div>
        <div class="mixer-page-subtitle">
          Break the on-chain link between your source and destination wallets using zero-knowledge proofs. Non-custodial and fully in-browser.
        </div>
      </div>

      <!-- Mixer Card -->
      <div class="mixer-card">

        <!-- PHASE 1: CONFIG -->
        <div class="mixer-phase mixer-phase-config" id="mixer-config">
          <div class="mixer-section-label">Connect Wallet</div>
          <div class="mixer-wallet-picker" id="mixer-wallet-picker">
            ${wallets.length === 0
              ? '<div class="mixer-no-wallets">No Solana wallets detected.<br>Install Phantom, Backpack, or Solflare to continue.</div>'
              : wallets.map(w => `
                  <button class="mixer-wallet-btn" data-wallet="${w.name}">
                    ${WALLET_ICONS[w.name] || WALLET_ICON_DEFAULT}
                    <span>${w.name}</span>
                  </button>
                `).join('')
            }
          </div>
          <div class="mixer-wallet-status" id="mixer-wallet-status"></div>

          <div class="mixer-section-label">Select Token</div>
          <div class="mixer-token-toggle" id="mixer-token-toggle">
            <button class="mixer-token-btn active" data-token="SOL">
              ${TOKEN_ICONS.SOL}
              <span>SOL</span>
            </button>
            <button class="mixer-token-btn" data-token="USDC">
              ${TOKEN_ICONS.USDC}
              <span>USDC</span>
            </button>
          </div>

          <div class="mixer-section-label">Amount</div>
          <div class="mixer-amount-wrap">
            <input class="mixer-amount-input" id="mixer-amount" type="number" min="0" step="any" placeholder="0.00" disabled />
            <span class="mixer-amount-suffix" id="mixer-amount-suffix">SOL</span>
          </div>

          <button class="mixer-mix-btn" id="mixer-mix-btn" disabled>
            <span>Mix Funds</span>
          </button>
        </div>

        <!-- PHASE 2: PROGRESS -->
        <div class="mixer-phase mixer-phase-progress" id="mixer-progress" style="display:none;">
          <div class="mixer-stepper" id="mixer-stepper">
            ${PIPELINE_STEPS.map((s, i) => `
              <div class="mixer-step pending" data-step="${s}">
                <div class="mixer-step-dot">${i + 1}</div>
                <div class="mixer-step-label">${STEP_LABELS[s]}</div>
              </div>
            `).join('')}
          </div>
          <div class="mixer-progress-msg" id="mixer-progress-msg">Initializing...</div>
          <div class="mixer-spinner" id="mixer-spinner"></div>
          <div class="mixer-warning">
            <strong>Please wait</strong> &mdash; ZK proofs are generated in-browser. This may take 30&ndash;60 seconds per proof. Do not close this window.
          </div>
        </div>

        <!-- PHASE 3: COMPLETE -->
        <div class="mixer-phase mixer-phase-complete" id="mixer-complete" style="display:none;">
          <div class="mixer-success-icon">${CHECK_SVG}</div>
          <div class="mixer-success-title">Mix Complete</div>

          <div class="mixer-section-label">Fresh Wallet Address</div>
          <div class="mixer-address-box" id="mixer-fresh-addr"></div>
          <button class="mixer-copy-btn" id="mixer-copy-addr">Copy Address</button>

          <div class="mixer-divider"></div>

          <div class="mixer-section-label">Private Key</div>
          <div class="mixer-danger-banner">Save this key now. It will NOT be shown again.</div>
          <div class="mixer-key-box mixer-key-hidden" id="mixer-key-box">Click to reveal private key</div>
          <button class="mixer-copy-btn" id="mixer-copy-key" style="display:none;">Copy Private Key</button>

          <div class="mixer-divider"></div>

          <div class="mixer-section-label">Transactions</div>
          <div class="mixer-tx-list" id="mixer-tx-list"></div>
        </div>

        <!-- ERROR PHASE -->
        <div class="mixer-phase mixer-phase-error" id="mixer-error" style="display:none;">
          <div class="mixer-error-icon">!</div>
          <div class="mixer-error-title">Something went wrong</div>
          <div class="mixer-error-msg" id="mixer-error-msg"></div>
          <button class="mixer-retry-btn" id="mixer-retry-btn">Try Again</button>
        </div>

      </div>
    </div>
  `;

  // ── REFS ──
  const configEl     = container.querySelector('#mixer-config');
  const progressEl   = container.querySelector('#mixer-progress');
  const completeEl   = container.querySelector('#mixer-complete');
  const errorEl      = container.querySelector('#mixer-error');
  const walletPicker = container.querySelector('#mixer-wallet-picker');
  const walletStatus = container.querySelector('#mixer-wallet-status');
  const tokenToggle  = container.querySelector('#mixer-token-toggle');
  const amountInput  = container.querySelector('#mixer-amount');
  const amountSuffix = container.querySelector('#mixer-amount-suffix');
  const mixBtn       = container.querySelector('#mixer-mix-btn');
  const stepperEl    = container.querySelector('#mixer-stepper');
  const progressMsg  = container.querySelector('#mixer-progress-msg');
  const freshAddrEl  = container.querySelector('#mixer-fresh-addr');
  const keyBoxEl     = container.querySelector('#mixer-key-box');
  const copyAddrBtn  = container.querySelector('#mixer-copy-addr');
  const copyKeyBtn   = container.querySelector('#mixer-copy-key');
  const txListEl     = container.querySelector('#mixer-tx-list');
  const errorMsgEl   = container.querySelector('#mixer-error-msg');
  const retryBtn     = container.querySelector('#mixer-retry-btn');

  let mixingInProgress = false;
  let resultData = null;

  // ── PHASE SWITCHING ──
  function showPhase(phase) {
    configEl.style.display   = phase === 'config'   ? '' : 'none';
    progressEl.style.display = phase === 'progress' ? '' : 'none';
    completeEl.style.display = phase === 'complete' ? '' : 'none';
    errorEl.style.display    = phase === 'error'    ? '' : 'none';
  }

  // ── WALLET PICKER ──
  walletPicker.addEventListener('click', async (e) => {
    const btn = e.target.closest('.mixer-wallet-btn');
    if (!btn) return;

    const walletName = btn.dataset.wallet;
    const wallet = wallets.find(w => w.name === walletName);
    if (!wallet) return;

    btn.disabled = true;
    btn.classList.add('connecting');
    const labelEl = btn.querySelector('span');
    const originalLabel = labelEl.textContent;
    labelEl.textContent = 'Connecting\u2026';

    try {
      const pubkey = await stepConnectSource(wallet.provider);
      walletStatus.textContent = `Connected: ${shortenAddress(pubkey)}`;
      walletStatus.classList.add('mixer-connected');
      walletPicker.querySelectorAll('.mixer-wallet-btn').forEach(b => {
        b.disabled = true;
        b.classList.remove('active', 'connecting');
      });
      btn.classList.add('active');
      amountInput.disabled = false;
      updateMixBtn();
    } catch (err) {
      btn.disabled = false;
      btn.classList.remove('connecting');
      labelEl.textContent = originalLabel;
      walletStatus.textContent = `Connection failed: ${err.message}`;
      walletStatus.classList.add('mixer-error-text');
    }
  });

  // ── TOKEN TOGGLE ──
  tokenToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.mixer-token-btn');
    if (!btn) return;
    tokenToggle.querySelectorAll('.mixer-token-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const token = btn.dataset.token;
    stepSelectToken(token, amountInput.value);
    amountSuffix.textContent = token;
    updateMixBtn();
  });

  // ── AMOUNT INPUT ──
  amountInput.addEventListener('input', () => {
    stepSelectToken(state.selectedToken, amountInput.value);
    updateMixBtn();
  });

  function updateMixBtn() {
    const hasWallet = !!state.sourcePublicKey;
    const hasAmount = parseFloat(amountInput.value) > 0;
    mixBtn.disabled = !(hasWallet && hasAmount);
  }

  // ── MIX BUTTON ──
  mixBtn.addEventListener('click', async () => {
    mixingInProgress = true;
    showPhase('progress');

    try {
      resultData = await executeMixerPipeline((step, msg) => {
        progressMsg.textContent = msg;
        updateStepper(step);
      });

      mixingInProgress = false;
      showComplete(resultData);
    } catch (err) {
      mixingInProgress = false;
      showError(state.errorMessage || err.message);
    }
  });

  // ── STEPPER UPDATE ──
  function updateStepper(currentStep) {
    const stepIdx = PIPELINE_STEPS.indexOf(currentStep);
    stepperEl.querySelectorAll('.mixer-step').forEach((el, i) => {
      const dot = el.querySelector('.mixer-step-dot');
      el.classList.remove('done', 'active', 'pending');
      if (i < stepIdx) {
        el.classList.add('done');
        dot.innerHTML = CHECK_SVG;
      } else if (i === stepIdx) {
        el.classList.add('active');
        dot.textContent = i + 1;
      } else {
        el.classList.add('pending');
        dot.textContent = i + 1;
      }
    });
  }

  // ── COMPLETE PHASE ──
  function showComplete(data) {
    showPhase('complete');
    freshAddrEl.textContent = data.freshPublicKey;
    keyBoxEl.textContent = 'Click to reveal private key';
    keyBoxEl.classList.add('mixer-key-hidden');
    copyKeyBtn.style.display = 'none';

    keyBoxEl.addEventListener('click', function revealKey() {
      keyBoxEl.textContent = data.freshPrivateKeyBase58;
      keyBoxEl.classList.remove('mixer-key-hidden');
      copyKeyBtn.style.display = '';
      keyBoxEl.removeEventListener('click', revealKey);
    });

    copyAddrBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(data.freshPublicKey);
      copyAddrBtn.textContent = 'Copied!';
      copyAddrBtn.classList.add('copied');
      setTimeout(() => {
        copyAddrBtn.textContent = 'Copy Address';
        copyAddrBtn.classList.remove('copied');
      }, 1500);
    });

    copyKeyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(data.freshPrivateKeyBase58);
      copyKeyBtn.textContent = 'Copied!';
      copyKeyBtn.classList.add('copied');
      setTimeout(() => {
        copyKeyBtn.textContent = 'Copy Private Key';
        copyKeyBtn.classList.remove('copied');
      }, 1500);
    });

    const network = (import.meta.env.VITE_SOLANA_NETWORK || 'mainnet-beta') === 'devnet' ? '?cluster=devnet' : '';
    txListEl.innerHTML = data.txSignatures
      .filter(Boolean)
      .map((sig, i) =>
        `<a class="mixer-tx-link" href="https://solscan.io/tx/${sig}${network}" target="_blank" rel="noopener">TX ${i + 1}: ${sig.slice(0, 16)}\u2026</a>`
      ).join('');
  }

  // ── ERROR PHASE ──
  function showError(msg) {
    showPhase('error');
    errorMsgEl.textContent = msg;
  }

  retryBtn.addEventListener('click', () => {
    state.setCurrentStep(STEP.IDLE);
    state.setErrorMessage('');
    state.setTxSignatures([]);
    showPhase('config');
  });

  // ── BEFOREUNLOAD GUARD ──
  window.addEventListener('beforeunload', (e) => {
    if (mixingInProgress) {
      e.preventDefault();
    }
  });
}
