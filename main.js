/* Enable JS class for CSS controls */
document.documentElement.classList.remove('no-js');
document.documentElement.classList.add('js');

/* Year in footer */
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* Theme toggle with persistence */
const themeToggle = document.getElementById('theme-toggle');
const root = document.documentElement;
const storedTheme = localStorage.getItem('theme');

if (storedTheme === 'light' || storedTheme === 'dark') {
  root.setAttribute('data-theme', storedTheme);
  themeToggle?.setAttribute('aria-pressed', storedTheme === 'dark' ? 'true' : 'false');
}

/* If nothing stored, respect system preference initially */
if (!storedTheme) {
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  themeToggle?.setAttribute('aria-pressed', prefersDark ? 'true' : 'false');
}

themeToggle?.addEventListener('click', () => {
  root.classList.add('theme-animate');
  const current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  themeToggle.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
  window.setTimeout(() => {
    root.classList.remove('theme-animate');
  }, 300);
});

/* Mobile menu */
const menuToggle = document.getElementById('menu-toggle');
const nav = document.getElementById('site-nav');

const openMenu = () => {
  nav.classList.add('open');
  menuToggle.setAttribute('aria-expanded', 'true');
  menuToggle.setAttribute('aria-label', 'Close menu');
  const firstLink = nav.querySelector('a');
  if (firstLink) firstLink.focus();
};
const closeMenu = () => {
  nav.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Open menu');
  menuToggle.focus();
};
menuToggle?.addEventListener('click', () => {
  const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
  expanded ? closeMenu() : openMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && nav.classList.contains('open')) closeMenu();
});
nav?.addEventListener('click', (e) => {
  const t = e.target;
  if (t instanceof HTMLAnchorElement && nav.classList.contains('open')) closeMenu();
});

/* Grab elements */
const header = document.getElementById('site-header');
/* ===== NWS Alerts: Clay County, KY (county UGC) ===== */
const alertBar = document.getElementById('site-alert');
const alertDismiss = document.getElementById('alert-dismiss');

const CLAY_COUNTY_UGC = 'KYC051';
// Enable mock via query param or localStorage
const qp = new URLSearchParams(location.search);
const MOCK_ALERTS = qp.has('mock-alert') || localStorage.getItem('mockAlerts') === '1';

// Use mock file when enabled
const NWS_ALERTS_URL = MOCK_ALERTS
  ? 'mock/alerts.json'
  : `https://api.weather.gov/alerts/active?zone=${CLAY_COUNTY_UGC}`;
const ALERT_KEY = 'ccky_alert_dismiss_until';   // existing key from your dismiss code
const ALERT_IDS_KEY = 'ccky_alert_ids';         // track which alerts we’ve shown

/* Remember dismissal until end of day (keep your existing code if already present) */
const shouldHideAlert = () => {
  const until = Number(localStorage.getItem(ALERT_KEY) || 0);
  return until && until > Date.now();
};
if (alertDismiss) {
  const now = new Date();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime();
  alertDismiss.addEventListener('click', () => {
    localStorage.setItem(ALERT_KEY, String(endOfDay));
    alertBar?.setAttribute('hidden', '');
    updateHeaderOffset?.();
  });
}

/* Helper to format local (ET) times */
const fmtET = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });

/* Fetch and render alerts for Clay County only */
async function loadClayAlerts() {
  try {
    const res = await fetch(NWS_ALERTS_URL, {
      headers: { 'Accept': 'application/geo+json' },
      cache: 'no-store'
    });
    if (!res.ok) throw new Error(`NWS ${res.status}`);
    const data = await res.json();
    const features = Array.isArray(data.features) ? data.features : [];

    const ids = features.map(f => f.id || f.properties?.id).filter(Boolean);
    const prev = (localStorage.getItem(ALERT_IDS_KEY) || '').split(',').filter(Boolean);
    const changed = ids.join(',') !== prev.join(',');
    if (changed) {
      // new/different alerts since last check: clear any old dismissal
      localStorage.removeItem(ALERT_KEY);
      localStorage.setItem(ALERT_IDS_KEY, ids.join(','));
    }

    // Nothing active → keep the bar hidden
    if (!features.length || shouldHideAlert()) {
      alertBar?.setAttribute('hidden', '');
      updateHeaderOffset?.();
      return;
    }

    // Pick the “worst” alert to headline
    const sevRank = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1, Unknown: 0 };
    features.sort((a, b) => (sevRank[b?.properties?.severity] || 0) - (sevRank[a?.properties?.severity] || 0));
    const top = features[0];
    const p = top.properties || {};
    const event = p.event || 'Alert';
    const sev = p.severity || 'Unknown';
    const until = p.ends || p.expires || null;
    const msg = until ? `${event} for Clay County — until ${fmtET(until)}` : `${event} for Clay County`;
    const moreCount = features.length > 1 ? ` • +${features.length - 1} more` : '';
    const url = top.id || p['@id'] || p.id || 'https://www.weather.gov/alerts';

    // Update DOM
    const msgEl = alertBar.querySelector('.alert-msg');
    if (msgEl) {
      msgEl.textContent = msg + moreCount;
      const link = document.createElement('a');
      link.href = url; link.target = '_blank'; link.rel = 'noopener';
      link.className = 'alert-link';
      link.textContent = ' More info';
      msgEl.appendChild(link);
    }
    alertBar.dataset.severity = sev;  // for optional CSS styling
    alertBar.removeAttribute('hidden');
    updateHeaderOffset?.();
  } catch (err) {
    console.error('NWS alerts error:', err);
    // Fail closed (hidden) rather than showing stale info
    alertBar?.setAttribute('hidden', '');
    updateHeaderOffset?.();
  }
}

// Run on load, then every 10 minutes
loadClayAlerts();
setInterval(loadClayAlerts, 10 * 60 * 1000);


/* Utility: current height if element exists & isn't hidden */
const getHeight = (el) => (el && !el.hasAttribute('hidden'))
  ? el.getBoundingClientRect().height
  : 0;

const updateHeaderOffset = () => {
  const headerH = header?.getBoundingClientRect().height || 0;
  document.documentElement.style.setProperty('--header-offset', `${headerH}px`);

  // If alert bar is visible, include its height in anchor offset
  const alertH = getHeight(alertBar);

  // No quick-help anymore
  const total = headerH + alertH + 12; // +12 for breathing room

  document.querySelectorAll('section[id]').forEach(sec => {
    sec.style.scrollMarginTop = `${total}px`;
  });
};

// keep these listeners
window.addEventListener('resize', updateHeaderOffset);
window.addEventListener('load', updateHeaderOffset);
updateHeaderOffset();


/* Smooth “Back to top” respecting reduced motion */
const backToTop = document.querySelector('[data-scroll-to-top]');
backToTop?.addEventListener('click', (e) => {
  e.preventDefault();
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' });
});
