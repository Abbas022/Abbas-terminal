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
  return s.slice(0, 6) + '...' + s.slice(-4);
}

export async function renderMixerPage(container) {
  await loadMixerDeps();
  const wallets = detectSolanaWallets();

  container.innerHTML = `
    <div class="mixer-page">
      <div class="mixer-page-title">SOLANA PRIVACY MIXER</div>
      <div class="mixer-card">

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
    btn.textContent = 'Connecting...';
    try {
      const pubkey = await stepConnectSource(wallet.provider);
      walletStatus.textContent = `Connected: ${shortenAddress(pubkey)}`;
      walletStatus.classList.add('mixer-connected');
      walletPicker.querySelectorAll('.mixer-wallet-btn').forEach(b => {
        b.disabled = true;
        b.classList.remove('active');
      });
      btn.classList.add('active');
      amountInput.disabled = false;
      updateMixBtn();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = walletName;
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

    keyBoxEl.addEventListener('click', function revealKey() {
      keyBoxEl.textContent = data.freshPrivateKeyBase58;
      keyBoxEl.classList.remove('mixer-key-hidden');
      copyKeyBtn.style.display = '';
      keyBoxEl.removeEventListener('click', revealKey);
    });

    copyAddrBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(data.freshPublicKey);
      copyAddrBtn.textContent = 'COPIED!';
      setTimeout(() => { copyAddrBtn.textContent = 'COPY ADDRESS'; }, 1500);
    });

    copyKeyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(data.freshPrivateKeyBase58);
      copyKeyBtn.textContent = 'COPIED!';
      setTimeout(() => { copyKeyBtn.textContent = 'COPY KEY'; }, 1500);
    });

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

  // ── BEFOREUNLOAD GUARD ──
  window.addEventListener('beforeunload', (e) => {
    if (mixingInProgress) {
      e.preventDefault();
    }
  });
}
