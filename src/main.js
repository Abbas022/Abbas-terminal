import './styles.css';

import { updateClock, updateSourceCount } from './ui-helpers.js';
import { initFilters } from './filters.js';
import { renderFeedStatus, renderCategoryStats, renderCountryWatch } from './sidebar.js';
import { fetchAllNews } from './news.js';
import { fetchMarkets } from './markets.js';
import { initWalletUI } from './wallet/wallet-ui.js';
import { initMixerUI } from './mixer/mixer-modal.js';

function refreshAll() {
  fetchAllNews();
  fetchMarkets();
}

// ── KEYBOARD: R to refresh ──
document.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    refreshAll();
  }
});

// ── VISIBILITY CHANGE: auto-refresh ──
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshAll();
});

// ── INIT ──
initFilters();
updateClock();
updateSourceCount();
renderCountryWatch();
renderFeedStatus();
renderCategoryStats();
initWalletUI();
initMixerUI();
setInterval(updateClock, 1000);
refreshAll();
setInterval(fetchAllNews, 120000);
setInterval(fetchMarkets, 60000);
