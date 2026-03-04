import './mixer-styles.css';

import { STEP, PIPELINE_STEPS, STEP_LABELS } from './mixer-state.js';
import * as state from './mixer-state.js';

// Heavy deps lazy-loaded when the modal opens
let detectSolanaWallets, disconnectSolanaWallet, stepConnectSource, stepSelectToken, executeMixerPipeline;

async function loadMixerDeps() {
  if (detectSolanaWallets) return;
  const [walletMod, flowMod] = await Promise.all([
    import('./solana-wallet.js'),
    import('./mixer-flow.js'),
  ]);
  detectSolanaWallets = walletMod.detectSolanaWallets;
  disconnectSolanaWallet = walletMod.disconnectSolanaWallet;
  stepConnectSource = flowMod.stepConnectSource;
  stepSelectToken = flowMod.stepSelectToken;
  executeMixerPipeline = flowMod.executeMixerPipeline;
}

// ── HELPERS ──

function removeModal() {
  const existing = document.querySelector('.mixer-overlay');
  if (existing) existing.remove();
}

function shortenAddress(addr) {
  const s = addr.toString();
  return s.slice(0, 6) + '...' + s.slice(-4);
}

// ── HEADER BUTTON ──

export function initMixerUI() {
  const header = document.querySelector('.header-bar');
  if (!header) return;

  const btn = document.createElement('button');
  btn.className = 'mixer-btn';
  btn.textContent = 'MIXER';
  btn.id = 'mixer-btn';
  btn.addEventListener('click', openMixerModal);
  header.appendChild(btn);
}

// ── MODAL ──

export async function openMixerModal() {
  removeModal();

  await loadMixerDeps();
  const wallets = detectSolanaWallets();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay mixer-overlay';
  overlay.innerHTML = `
    <div class="modal-panel mixer-panel">
      <button class="modal-close">&times;</button>
      <div class="modal-title">PRIVACY MIXER</div>

      <!-- PHASE 1: CONFIG -->
      <div class="mixer-phase mixer-phase-config" id="mixer-config">
        <div class="mixer-section-label">WALLET</div>
        <div class="mixer-wallet-picker" id="mixer-wallet-picker">
          ${wallets.length === 0
            ? '<div class="mixer-no-wallets">No Solana wallets detected. Install Phantom or Backpack.</div>'
            : wallets.map(w => `<button class="mixer-wallet-btn" data-wallet="${w.name}">${w.name}</button>`).join('')
          }
        </div>
        <div class="mixer-wallet-status" id="mixer-wallet-status"></div>
        <div class="mixer-wallet-connected" id="mixer-wallet-connected" style="display:none;">
          <span class="mixer-wallet-addr" id="mixer-wallet-addr"></span>
          <button class="mixer-disconnect-btn" id="mixer-disconnect-btn">Disconnect</button>
        </div>

        <div class="mixer-section-label">TOKEN</div>
        <div class="mixer-token-toggle" id="mixer-token-toggle">
          <button class="mixer-token-btn active" data-token="SOL">SOL</button>
          <button class="mixer-token-btn" data-token="USDC">USDC</button>
        </div>

        <div class="mixer-section-label">AMOUNT</div>
        <input class="mixer-amount-input" id="mixer-amount" type="number" min="0" step="any" placeholder="0.00" disabled />

        <button class="mixer-mix-btn" id="mixer-mix-btn" disabled>MIX FUNDS</button>
      </div>

      <!-- PHASE 2: PROGRESS -->
      <div class="mixer-phase mixer-phase-progress" id="mixer-progress" style="display:none;">
        <div class="mixer-stepper" id="mixer-stepper">
          ${PIPELINE_STEPS.map(s => `
            <div class="mixer-step" data-step="${s}">
              <div class="mixer-step-dot"></div>
              <div class="mixer-step-label">${STEP_LABELS[s]}</div>
            </div>
          `).join('')}
        </div>
        <div class="mixer-progress-msg" id="mixer-progress-msg">Initializing...</div>
        <div class="mixer-spinner" id="mixer-spinner"></div>
        <div class="mixer-warning">ZK proofs are generated in-browser. This may take 30-60 seconds per proof. Do not close this window.</div>
      </div>

      <!-- PHASE 3: COMPLETE -->
      <div class="mixer-phase mixer-phase-complete" id="mixer-complete" style="display:none;">
        <div class="mixer-success-icon">&#10003;</div>
        <div class="mixer-section-label">FRESH WALLET ADDRESS</div>
        <div class="mixer-address-box" id="mixer-fresh-addr"></div>
        <button class="mixer-copy-btn" id="mixer-copy-addr">COPY ADDRESS</button>

        <div class="mixer-section-label">PRIVATE KEY</div>
        <div class="mixer-danger-banner">Save this key now. It will NOT be shown again.</div>
        <div class="mixer-key-box mixer-key-hidden" id="mixer-key-box">Click to reveal</div>
        <button class="mixer-copy-btn" id="mixer-copy-key" style="display:none;">COPY KEY</button>

        <div class="mixer-section-label">TRANSACTIONS</div>
        <div class="mixer-tx-list" id="mixer-tx-list"></div>
      </div>

      <!-- ERROR -->
      <div class="mixer-phase mixer-phase-error" id="mixer-error" style="display:none;">
        <div class="mixer-error-icon">!</div>
        <div class="mixer-error-msg" id="mixer-error-msg"></div>
        <button class="mixer-retry-btn" id="mixer-retry-btn">TRY AGAIN</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // ── REFS ──
  const configEl    = overlay.querySelector('#mixer-config');
  const progressEl  = overlay.querySelector('#mixer-progress');
  const completeEl  = overlay.querySelector('#mixer-complete');
  const errorEl     = overlay.querySelector('#mixer-error');
  const walletPicker    = overlay.querySelector('#mixer-wallet-picker');
  const walletStatus    = overlay.querySelector('#mixer-wallet-status');
  const walletConnected = overlay.querySelector('#mixer-wallet-connected');
  const walletAddrEl    = overlay.querySelector('#mixer-wallet-addr');
  const disconnectBtn   = overlay.querySelector('#mixer-disconnect-btn');
  const tokenToggle     = overlay.querySelector('#mixer-token-toggle');
  const amountInput     = overlay.querySelector('#mixer-amount');
  const mixBtn          = overlay.querySelector('#mixer-mix-btn');
  const stepperEl       = overlay.querySelector('#mixer-stepper');
  const progressMsg     = overlay.querySelector('#mixer-progress-msg');
  const spinnerEl       = overlay.querySelector('#mixer-spinner');
  const freshAddrEl     = overlay.querySelector('#mixer-fresh-addr');
  const keyBoxEl        = overlay.querySelector('#mixer-key-box');
  const copyAddrBtn     = overlay.querySelector('#mixer-copy-addr');
  const copyKeyBtn      = overlay.querySelector('#mixer-copy-key');
  const txListEl        = overlay.querySelector('#mixer-tx-list');
  const errorMsgEl      = overlay.querySelector('#mixer-error-msg');
  const retryBtn        = overlay.querySelector('#mixer-retry-btn');

  let mixingInProgress = false;
  let resultData = null;
  let connectedWallet = null;

  // ── PHASE SWITCHING ──
  function showPhase(phase) {
    configEl.style.display   = phase === 'config'   ? '' : 'none';
    progressEl.style.display = phase === 'progress' ? '' : 'none';
    completeEl.style.display = phase === 'complete' ? '' : 'none';
    errorEl.style.display    = phase === 'error'    ? '' : 'none';
  }

  function showWalletConnected(address) {
    walletPicker.style.display = 'none';
    walletStatus.style.display = 'none';
    walletConnected.style.display = '';
    walletAddrEl.textContent = shortenAddress(address);
    amountInput.disabled = false;
    updateMixBtn();
  }

  function showWalletDisconnected() {
    connectedWallet = null;
    state.setSourcePublicKey(null);
    state.setSourceProvider(null);
    walletPicker.style.display = '';
    walletStatus.style.display = '';
    walletStatus.textContent = '';
    walletStatus.classList.remove('mixer-connected', 'mixer-error-text');
    walletConnected.style.display = 'none';
    walletPicker.querySelectorAll('.mixer-wallet-btn').forEach(b => {
      b.disabled = false;
      b.classList.remove('active');
      b.textContent = b.dataset.wallet;
    });
    amountInput.disabled = true;
    amountInput.value = '';
    updateMixBtn();
  }

  // ── CLOSE HANDLING ──
  function handleClose() {
    if (mixingInProgress) {
      if (!confirm('Mixing is in progress. Closing may result in lost funds. Are you sure?')) return;
    }
    state.clearSensitiveState();
    removeModal();
  }

  overlay.querySelector('.modal-close').addEventListener('click', handleClose);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) handleClose();
  });

  // ── WALLET PICKER ──
  walletPicker.addEventListener('click', async (e) => {
    const btn = e.target.closest('.mixer-wallet-btn');
    if (!btn) return;

    const walletName = btn.dataset.wallet;
    const wallet = wallets.find(w => w.name === walletName);
    if (!wallet) return;

    btn.disabled = true;
    btn.textContent = 'Connecting\u2026';
    try {
      const address = await stepConnectSource(wallet.provider);
      connectedWallet = wallet;
      showWalletConnected(address);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = walletName;
      walletStatus.textContent = `Connection failed: ${err.message}`;
      walletStatus.classList.add('mixer-error-text');
    }
  });

  // ── DISCONNECT ──
  disconnectBtn.addEventListener('click', async () => {
    if (mixingInProgress) return;
    if (connectedWallet) {
      try { await disconnectSolanaWallet(connectedWallet.provider); } catch (_) {}
    }
    showWalletDisconnected();
  });

  // ── TOKEN TOGGLE ──
  tokenToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.mixer-token-btn');
    if (!btn) return;
    tokenToggle.querySelectorAll('.mixer-token-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    stepSelectToken(btn.dataset.token, amountInput.value);
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
      el.classList.remove('done', 'active', 'pending');
      if (i < stepIdx)       el.classList.add('done');
      else if (i === stepIdx) el.classList.add('active');
      else                    el.classList.add('pending');
    });
  }

  // ── COMPLETE PHASE ──
  function showComplete(data) {
    showPhase('complete');
    freshAddrEl.textContent = data.freshPublicKey;
    keyBoxEl.textContent = 'Click to reveal';
    keyBoxEl.classList.add('mixer-key-hidden');
    copyKeyBtn.style.display = 'none';

    // Reveal key on click
    keyBoxEl.addEventListener('click', function revealKey() {
      keyBoxEl.textContent = data.freshPrivateKeyBase58;
      keyBoxEl.classList.remove('mixer-key-hidden');
      copyKeyBtn.style.display = '';
      keyBoxEl.removeEventListener('click', revealKey);
    });

    // Copy address
    copyAddrBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(data.freshPublicKey);
      copyAddrBtn.textContent = 'COPIED!';
      setTimeout(() => { copyAddrBtn.textContent = 'COPY ADDRESS'; }, 1500);
    });

    // Copy key
    copyKeyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(data.freshPrivateKeyBase58);
      copyKeyBtn.textContent = 'COPIED!';
      setTimeout(() => { copyKeyBtn.textContent = 'COPY KEY'; }, 1500);
    });

    // Transaction links
    const network = (import.meta.env.VITE_SOLANA_NETWORK || 'mainnet-beta') === 'devnet' ? '?cluster=devnet' : '';
    txListEl.innerHTML = data.txSignatures
      .filter(Boolean)
      .map((sig, i) =>
        `<a class="mixer-tx-link" href="https://solscan.io/tx/${sig}${network}" target="_blank" rel="noopener">TX ${i + 1}: ${sig.slice(0, 12)}...</a>`
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
}
