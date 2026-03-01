// ── MIXER STEP ENUM ──
export const STEP = {
  IDLE:            'IDLE',
  CONNECT:         'CONNECT',
  SELECT:          'SELECT',
  GENERATE:        'GENERATE',
  REGISTER_SOURCE: 'REGISTER_SOURCE',
  REGISTER_FRESH:  'REGISTER_FRESH',
  DEPOSIT:         'DEPOSIT',
  CREATE_UTXO:     'CREATE_UTXO',
  CLAIM_UTXO:      'CLAIM_UTXO',
  WITHDRAW:        'WITHDRAW',
  COMPLETE:        'COMPLETE',
  ERROR:           'ERROR',
};

// Ordered pipeline steps (for stepper UI)
export const PIPELINE_STEPS = [
  STEP.GENERATE,
  STEP.REGISTER_SOURCE,
  STEP.REGISTER_FRESH,
  STEP.DEPOSIT,
  STEP.CREATE_UTXO,
  STEP.CLAIM_UTXO,
  STEP.WITHDRAW,
];

export const STEP_LABELS = {
  [STEP.GENERATE]:        'Generate Wallet',
  [STEP.REGISTER_SOURCE]: 'Register Source',
  [STEP.REGISTER_FRESH]:  'Register Fresh',
  [STEP.DEPOSIT]:         'Deposit',
  [STEP.CREATE_UTXO]:     'Create UTXO',
  [STEP.CLAIM_UTXO]:      'Claim UTXO',
  [STEP.WITHDRAW]:        'Withdraw',
};

// ── MUTABLE STATE ──
export let currentStep = STEP.IDLE;
export let sourcePublicKey = null;
export let sourceProvider = null;
export let freshSigner = null;
export let freshPublicKey = null;
export let freshPrivateKey = null;   // Uint8Array — zeroed on modal close
export let selectedToken = 'SOL';
export let selectedAmount = '';
export let sourceUmbraClient = null;
export let freshUmbraClient = null;
export let txSignatures = [];
export let errorMessage = '';

// ── SETTERS ──
export function setCurrentStep(val)      { currentStep = val; }
export function setSourcePublicKey(val)   { sourcePublicKey = val; }
export function setSourceProvider(val)    { sourceProvider = val; }
export function setFreshSigner(val)       { freshSigner = val; }
export function setFreshPublicKey(val)    { freshPublicKey = val; }
export function setFreshPrivateKey(val)   { freshPrivateKey = val; }
export function setSelectedToken(val)     { selectedToken = val; }
export function setSelectedAmount(val)    { selectedAmount = val; }
export function setSourceUmbraClient(val) { sourceUmbraClient = val; }
export function setFreshUmbraClient(val)  { freshUmbraClient = val; }
export function setTxSignatures(val)      { txSignatures = val; }
export function setErrorMessage(val)      { errorMessage = val; }

// Zero out sensitive data
export function clearSensitiveState() {
  if (freshPrivateKey instanceof Uint8Array) {
    freshPrivateKey.fill(0);
  }
  freshPrivateKey = null;
  freshSigner = null;
  freshPublicKey = null;
  sourceUmbraClient = null;
  freshUmbraClient = null;
  txSignatures = [];
  errorMessage = '';
  currentStep = STEP.IDLE;
}
