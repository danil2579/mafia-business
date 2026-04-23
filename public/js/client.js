// ============================================================
// MAFIA BUSINESS v3 — Client (Full Redesign)
// ============================================================
const socket = io();

// ===== CONNECTION STATUS INDICATOR =====
// Shows a persistent banner when the socket drops, removes it on reconnect.
(function initConnectionIndicator() {
  let banner = null;
  const ensureBanner = (text) => {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'connection-banner';
      banner.style.cssText = [
        'position:fixed','top:0','left:0','right:0','z-index:99999',
        'background:#c0392b','color:#fff','text-align:center','padding:8px 12px',
        'font:600 14px system-ui,sans-serif','letter-spacing:0.3px',
        'box-shadow:0 2px 8px rgba(0,0,0,0.35)'
      ].join(';');
      document.body && document.body.appendChild(banner);
    } else if (!banner.parentNode) {
      document.body && document.body.appendChild(banner);
    }
    banner.textContent = text;
  };
  const removeBanner = () => {
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
  };
  socket.on('disconnect', (reason) => {
    ensureBanner('⚠ З\'єднання втрачено, перепідключаюсь…');
  });
  socket.io.on('reconnect_attempt', () => {
    ensureBanner('⚠ Перепідключення…');
  });
  socket.on('connect', () => {
    // Give the server a moment to re-establish room state, then hide banner
    setTimeout(removeBanner, 300);
  });
})();

let myId = null;
let myRoomId = null;
let gameState = null;
let selectedBetType = null;
let attackTimer = null;
let prevPositions = {}; // track previous positions for smooth animation
let prevMoney = {}; // track previous money for animation
let animatingTokens = false;
let animatingPlayerId = null; // player whose token is being animated
let pendingActionDelay = 0; // ms to delay showing pending actions (for animation)

// ===== INLINE SVG ICONS (replacing emojis) =====
const ICON = {
  dice: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="16" cy="8" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="8" cy="16" r="1.5" fill="currentColor"/><circle cx="16" cy="16" r="1.5" fill="currentColor"/></svg>`,
  chat: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`,
  send: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>`,
  music_on: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"/></svg>`,
  music_off: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`,
  swords: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 20l5-5M14.5 5.5L18 2l4 4-3.5 3.5M14.5 5.5l-8 8L4 16l2.5 2.5 8-8M20 20l-5-5M9.5 5.5L6 2 2 6l3.5 3.5M9.5 5.5l8 8L20 16l-2.5 2.5-8-8"/></svg>`,
  crown: `<svg class="icon" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><path d="M2 20h20L19 8l-5 5-2-7-2 7-5-5-3 12z"/></svg>`,
  chain: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`,
  cards: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="14" height="18" rx="2"/><path d="M7 3l4-1.5 8 17.5-4 1.5z"/></svg>`,
  signal: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></svg>`,
  handshake: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 17l-4-4-3 3-4-4-5 5"/><path d="M4 7l4 4 3-3 4 4 5-5"/><path d="M2 12h2M20 12h2"/></svg>`,
  building: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 21h18M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/></svg>`,
  money: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/></svg>`,
  bomb: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="13" r="8"/><path d="M15 5l2-2M14 6l4-1"/><path d="M11 9v4M9 11h4"/></svg>`,
  skull: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2C7 2 3 6 3 10.5c0 3 1.5 5 3.5 6.5V20h3v2h5v-2h3v-3c2-1.5 3.5-3.5 3.5-6.5C21 6 17 2 12 2z"/><circle cx="9" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/><path d="M10 16h4"/></svg>`,
  casino_chip: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>`,
  check: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg>`,
  trade: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 16V4l-4 4M17 8v12l4-4"/></svg>`,
  circle_green: `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#2ecc71"/></svg>`,
  circle_red: `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#e91e90"/></svg>`,
  circle_black: `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#2c3e50"/></svg>`,
  lock: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>`,
  gun: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 8h14l2 2v3h-6v4l-2 2H9v-6H3V8z"/><path d="M17 8l2-3h2v5"/></svg>`,
  shield: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  police: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 1l2 5h5l-4 3 1.5 5L12 11l-4.5 3L9 9 5 6h5z"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>`,
  medal_gold: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="#f0d060" stroke-width="1.5"><circle cx="12" cy="15" r="6" fill="rgba(240,208,96,0.2)"/><path d="M8 2l4 8 4-8" stroke="#f0d060"/></svg>`,
  medal_silver: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="#c0c0c0" stroke-width="1.5"><circle cx="12" cy="15" r="6" fill="rgba(192,192,192,0.2)"/><path d="M8 2l4 8 4-8" stroke="#c0c0c0"/></svg>`,
  medal_bronze: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="#cd7f32" stroke-width="1.5"><circle cx="12" cy="15" r="6" fill="rgba(205,127,50,0.2)"/><path d="M8 2l4 8 4-8" stroke="#cd7f32"/></svg>`,
  explosion: `<svg class="icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l2 6 5-3-3 5 6 2-6 2 3 5-5-3-2 6-2-6-5 3 3-5-6-2 6-2-3-5 5 3z"/></svg>`,
  fire: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22c-4-2-8-6-8-11 0-3 2-5 4-6 0 3 2 5 4 5 0-4 1-8 4-10 1 3 4 6 4 11 0 5-4 9-8 11z"/></svg>`,
  document: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>`,
  eye: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  fist: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 20l4-4M17 8l-8 8M7 4v8l-3 3M14 4l-3 3M17 4v4"/></svg>`,
  mask: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3C7 3 3 7.5 3 11c0 2 1 3 2.5 3.5L7 21l5-3 5 3 1.5-6.5C20 14 21 13 21 11c0-3.5-4-8-9-8z"/><circle cx="9" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/></svg>`,
};
// ===== TV / PHONE MODE DETECTION =====
const urlParams = new URLSearchParams(window.location.search);
const isTVMode = urlParams.get('mode') === 'tv';
const isPhoneMode = urlParams.get('mode') === 'phone';

let cardRevealActive = false; // true while card reveal is shown — blocks pending actions
let _cardRevealTimeout = null; // safety timeout to force-clear cardRevealActive
let confirmedPendingId = null; // track already-confirmed pending action to avoid re-show
// Unique key for a pending action — includes card id, player id, turn number so
// two chained same-type events (event_confirm → Без гальм → new event_confirm)
// don't collide and block the second one.
function makePendingKey(action, state) {
  if (!action) return null;
  return [
    action.type,
    action.card?.id || '',
    action.businessId || '',
    action.playerId || '',
    state?.turnNumber || 0
  ].join('|');
}
let botAnimationQueue = []; // queue of bot animations to play
let prevCurrentPlayerId = null; // track turn changes for turn start SFX
let selectedCharacterId = null; // selected character for lobby

// ===== CHARACTER PORTRAITS (SVG) =====
const PORTRAITS = {
  eddie: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="24" r="14" fill="#e74c3c" opacity="0.15"/><circle cx="32" cy="24" r="12" stroke="#e74c3c" stroke-width="1.5" fill="none"/><path d="M22 22c0-2 2-6 10-6s10 4 10 6" stroke="#e74c3c" stroke-width="1.2"/><circle cx="27" cy="23" r="1.5" fill="#e74c3c"/><circle cx="37" cy="23" r="1.5" fill="#e74c3c"/><path d="M28 29q4 3 8 0" stroke="#e74c3c" stroke-width="1.2" fill="none"/><path d="M20 38c2-4 7-6 12-6s10 2 12 6v8H20z" fill="#e74c3c" opacity="0.2" stroke="#e74c3c" stroke-width="1"/><line x1="38" y1="16" x2="42" y2="12" stroke="#e74c3c" stroke-width="1.5"/><line x1="40" y1="18" x2="44" y2="14" stroke="#e74c3c" stroke-width="1.5"/></svg>`,
  carlo: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="24" r="14" fill="#2980b9" opacity="0.15"/><circle cx="32" cy="24" r="12" stroke="#2980b9" stroke-width="1.5" fill="none"/><path d="M20 20c2-4 6-6 12-6s10 2 12 6" stroke="#2980b9" stroke-width="1.5"/><path d="M18 20h28" stroke="#2980b9" stroke-width="1" opacity="0.5"/><circle cx="27" cy="24" r="1.5" fill="#2980b9"/><circle cx="37" cy="24" r="1.5" fill="#2980b9"/><path d="M28 29q4 2 8 0" stroke="#2980b9" stroke-width="1.2" fill="none"/><path d="M24 30l-2 4" stroke="#2980b9" stroke-width="1"/><path d="M20 38c2-4 7-6 12-6s10 2 12 6v8H20z" fill="#2980b9" opacity="0.2" stroke="#2980b9" stroke-width="1"/></svg>`,
  vinnie: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="24" r="14" fill="#2ecc71" opacity="0.15"/><circle cx="32" cy="24" r="12" stroke="#2ecc71" stroke-width="1.5" fill="none"/><path d="M22 20c2-3 5-5 10-5s8 2 10 5" stroke="#2ecc71" stroke-width="1.5"/><circle cx="27" cy="24" r="1.5" fill="#2ecc71"/><circle cx="37" cy="24" r="1.5" fill="#2ecc71"/><path d="M29 29q3 2 6 0" stroke="#2ecc71" stroke-width="1.2" fill="none"/><path d="M20 38c2-4 7-6 12-6s10 2 12 6v8H20z" fill="#2ecc71" opacity="0.2" stroke="#2ecc71" stroke-width="1"/><rect x="26" y="32" width="12" height="2" rx="1" fill="#2ecc71" opacity="0.3"/></svg>`,
  sal: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="24" r="14" fill="#f1c40f" opacity="0.15"/><circle cx="32" cy="24" r="12" stroke="#f1c40f" stroke-width="1.5" fill="none"/><path d="M24 16l8-4 8 4" stroke="#f1c40f" stroke-width="1.5" fill="rgba(241,196,15,0.1)"/><circle cx="27" cy="24" r="1.5" fill="#f1c40f"/><circle cx="37" cy="24" r="1.5" fill="#f1c40f"/><path d="M27 29q5 3 10 0" stroke="#f1c40f" stroke-width="1.2" fill="none"/><path d="M20 38c2-4 7-6 12-6s10 2 12 6v8H20z" fill="#f1c40f" opacity="0.2" stroke="#f1c40f" stroke-width="1"/><path d="M29 40v6M35 40v6" stroke="#f1c40f" stroke-width="0.8" opacity="0.5"/></svg>`,
  niko: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="24" r="14" fill="#9b59b6" opacity="0.15"/><circle cx="32" cy="24" r="12" stroke="#9b59b6" stroke-width="1.5" fill="none"/><path d="M22 22c2-5 5-7 10-7s8 2 10 7" stroke="#9b59b6" stroke-width="1.5"/><rect x="24" y="22" width="6" height="3" rx="1" stroke="#9b59b6" stroke-width="0.8" fill="rgba(155,89,182,0.1)"/><rect x="34" y="22" width="6" height="3" rx="1" stroke="#9b59b6" stroke-width="0.8" fill="rgba(155,89,182,0.1)"/><circle cx="27" cy="23.5" r="1" fill="#9b59b6"/><circle cx="37" cy="23.5" r="1" fill="#9b59b6"/><path d="M29 29q3 1 6 0" stroke="#9b59b6" stroke-width="1" fill="none"/><path d="M20 38c2-4 7-6 12-6s10 2 12 6v8H20z" fill="#9b59b6" opacity="0.2" stroke="#9b59b6" stroke-width="1"/></svg>`,
  rosa: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="24" r="14" fill="#e91e90" opacity="0.15"/><circle cx="32" cy="24" r="12" stroke="#e91e90" stroke-width="1.5" fill="none"/><path d="M20 22c2-3 4-6 12-6s10 3 12 6" stroke="#e91e90" stroke-width="1.2"/><path d="M20 22c-1 3 0 8 2 10" stroke="#e91e90" stroke-width="1" opacity="0.6"/><path d="M44 22c1 3 0 8-2 10" stroke="#e91e90" stroke-width="1" opacity="0.6"/><circle cx="27" cy="24" r="1.5" fill="#e91e90"/><circle cx="37" cy="24" r="1.5" fill="#e91e90"/><path d="M27 24l-2-1M37 24l2-1" stroke="#e91e90" stroke-width="0.8"/><path d="M28 29q4 3 8 0" stroke="#e91e90" stroke-width="1.2" fill="none"/><path d="M20 38c2-4 7-6 12-6s10 2 12 6v8H20z" fill="#e91e90" opacity="0.2" stroke="#e91e90" stroke-width="1"/></svg>`,
  tommy: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="24" r="14" fill="#e67e22" opacity="0.15"/><circle cx="32" cy="24" r="12" stroke="#e67e22" stroke-width="1.5" fill="none"/><path d="M22 20c2-3 5-5 10-5s8 2 10 5" stroke="#e67e22" stroke-width="1.5"/><circle cx="27" cy="24" r="1.5" fill="#e67e22"/><circle cx="37" cy="24" r="1.5" fill="#e67e22"/><path d="M26 28h12" stroke="#e67e22" stroke-width="1.5"/><path d="M20 38c2-4 7-6 12-6s10 2 12 6v8H20z" fill="#e67e22" opacity="0.2" stroke="#e67e22" stroke-width="1"/><path d="M24 18l-2-4M40 18l2-4" stroke="#e67e22" stroke-width="1.2"/></svg>`,
  frankie: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="24" r="14" fill="#00bcd4" opacity="0.15"/><circle cx="32" cy="24" r="12" stroke="#00bcd4" stroke-width="1.5" fill="none"/><path d="M22 20c2-3 5-5 10-5s8 2 10 5" stroke="#00bcd4" stroke-width="1.5"/><circle cx="27" cy="24" r="1.5" fill="#00bcd4"/><circle cx="37" cy="24" r="1.5" fill="#00bcd4"/><path d="M29 29q3 1 6 0" stroke="#00bcd4" stroke-width="1" fill="none"/><path d="M20 38c2-4 7-6 12-6s10 2 12 6v8H20z" fill="#00bcd4" opacity="0.2" stroke="#00bcd4" stroke-width="1"/><line x1="26" y1="42" x2="38" y2="42" stroke="#00bcd4" stroke-width="1"/><line x1="28" y1="44" x2="36" y2="44" stroke="#00bcd4" stroke-width="0.8"/></svg>`
};

// ===== HELPER PORTRAITS (SVG) — thematic icons for each helper =====
const HELPER_PORTRAITS = {
  // Стенлі Поллак — бізнесмен, купує вплив (портфель + графік)
  stanley_pollak: `<svg viewBox="0 0 48 48" fill="none"><rect x="12" y="20" width="24" height="16" rx="2" stroke="#3498db" stroke-width="1.5" fill="rgba(52,152,219,0.1)"/><path d="M18 20v-4a6 6 0 0 1 12 0v4" stroke="#3498db" stroke-width="1.5"/><rect x="20" y="25" width="8" height="5" rx="1" fill="rgba(52,152,219,0.25)" stroke="#3498db" stroke-width="1"/><circle cx="24" cy="27.5" r="1" fill="#3498db"/><path d="M14 40l4-6 4 3 4-8 4 5 4-3 4 6" stroke="#3498db" stroke-width="1" opacity="0.4"/></svg>`,
  // «Уайті» Росс — дешевші замахи (ніж зі знижкою)
  whitey_ross: `<svg viewBox="0 0 48 48" fill="none"><path d="M30 8l-4 24-2-1 4-23z" fill="rgba(231,76,60,0.2)" stroke="#e74c3c" stroke-width="1.2"/><path d="M26 32l-4 6h8z" fill="rgba(231,76,60,0.15)" stroke="#e74c3c" stroke-width="1"/><path d="M22 30c-2 0-4 1-5 3" stroke="#e74c3c" stroke-width="1.2"/><circle cx="14" cy="16" r="6" stroke="#e74c3c" stroke-width="1" stroke-dasharray="2 2" fill="none"/><text x="14" y="19" text-anchor="middle" fill="#e74c3c" font-size="8" font-weight="700">-$</text></svg>`,
  // «Скажений Пес» — безкоштовна засідка (вовча голова з ікленами)
  mad_dog: `<svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="22" r="12" fill="rgba(230,126,34,0.1)"/><path d="M14 18c2-6 5-8 10-8s8 2 10 8" stroke="#e67e22" stroke-width="1.5"/><path d="M12 18l4-10" stroke="#e67e22" stroke-width="1.5"/><path d="M36 18l-4-10" stroke="#e67e22" stroke-width="1.5"/><circle cx="20" cy="20" r="2" fill="#e67e22"/><circle cx="28" cy="20" r="2" fill="#e67e22"/><path d="M18 27l2-2 2 2 2-2 2 2 2-2 2 2" stroke="#e67e22" stroke-width="1.5" fill="none"/><path d="M16 30c2 4 5 6 8 6s6-2 8-6" stroke="#e67e22" stroke-width="1" opacity="0.4"/></svg>`,
  // Ленні «Щука» — бонус на не-мафіа (риба/щука з монетою)
  lenny_pike: `<svg viewBox="0 0 48 48" fill="none"><ellipse cx="24" cy="24" rx="14" ry="8" fill="rgba(46,204,113,0.1)" stroke="#2ecc71" stroke-width="1.3"/><path d="M38 24l6-6v12z" fill="rgba(46,204,113,0.2)" stroke="#2ecc71" stroke-width="1"/><circle cx="16" cy="22" r="1.5" fill="#2ecc71"/><path d="M10 24h4" stroke="#2ecc71" stroke-width="1"/><path d="M20 20c2-1 6-1 8 0" stroke="#2ecc71" stroke-width="0.8" opacity="0.5"/><path d="M20 28c2 1 6 1 8 0" stroke="#2ecc71" stroke-width="0.8" opacity="0.5"/><circle cx="34" cy="14" r="5" stroke="#2ecc71" stroke-width="1" fill="rgba(46,204,113,0.15)"/><text x="34" y="17" text-anchor="middle" fill="#2ecc71" font-size="7" font-weight="700">$</text></svg>`,
  // Лео «Акробат» — вихід з в'язниці (розломана решітка)
  leo_acrobat: `<svg viewBox="0 0 48 48" fill="none"><rect x="10" y="10" width="28" height="28" rx="3" stroke="#9b59b6" stroke-width="1.2" fill="rgba(155,89,182,0.06)"/><line x1="18" y1="10" x2="18" y2="38" stroke="#9b59b6" stroke-width="2"/><line x1="26" y1="10" x2="26" y2="20" stroke="#9b59b6" stroke-width="2"/><line x1="27" y1="26" x2="30" y2="38" stroke="#9b59b6" stroke-width="2"/><line x1="34" y1="10" x2="34" y2="38" stroke="#9b59b6" stroke-width="2"/><path d="M24 22c2-1 4 0 5 2" stroke="#9b59b6" stroke-width="1.5" stroke-dasharray="2 1"/><circle cx="30" cy="20" r="4" stroke="#f1c40f" stroke-width="1.2" fill="rgba(241,196,15,0.15)"/><path d="M28 20l2 2 4-4" stroke="#f1c40f" stroke-width="1.2"/></svg>`,
  // Віллі «Безжалісний» — грабує жертв (череп з грошима)
  willie_ruthless: `<svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="20" r="10" fill="rgba(192,57,43,0.1)" stroke="#c0392b" stroke-width="1.3"/><circle cx="20" cy="18" r="2.5" fill="none" stroke="#c0392b" stroke-width="1.2"/><circle cx="28" cy="18" r="2.5" fill="none" stroke="#c0392b" stroke-width="1.2"/><path d="M20 25h8" stroke="#c0392b" stroke-width="1"/><line x1="22" y1="25" x2="22" y2="28" stroke="#c0392b" stroke-width="0.8"/><line x1="26" y1="25" x2="26" y2="28" stroke="#c0392b" stroke-width="0.8"/><path d="M16 34l3-4h10l3 4" stroke="#c0392b" stroke-width="1"/><rect x="18" y="34" width="12" height="6" rx="1" fill="rgba(46,204,113,0.15)" stroke="#2ecc71" stroke-width="1"/><text x="24" y="39" text-anchor="middle" fill="#2ecc71" font-size="6" font-weight="700">$$$</text></svg>`,
  // Тоні «Лис» — +1 вплив при вбивстві (лисяча морда)
  tony_fox: `<svg viewBox="0 0 48 48" fill="none"><path d="M10 12l6 10h-2l-4 8" stroke="#e67e22" stroke-width="1.3" fill="rgba(230,126,34,0.1)"/><path d="M38 12l-6 10h2l4 8" stroke="#e67e22" stroke-width="1.3" fill="rgba(230,126,34,0.1)"/><ellipse cx="24" cy="26" rx="10" ry="8" fill="rgba(230,126,34,0.12)" stroke="#e67e22" stroke-width="1.3"/><circle cx="20" cy="24" r="1.5" fill="#e67e22"/><circle cx="28" cy="24" r="1.5" fill="#e67e22"/><path d="M21 30q3 2 6 0" stroke="#e67e22" stroke-width="1" fill="none"/><path d="M24 30v3" stroke="#e67e22" stroke-width="0.8"/><path d="M14 32c-4 4-6 6-8 6" stroke="#e67e22" stroke-width="1.2"/><path d="M34 32c4 4 6 6 8 6" stroke="#e67e22" stroke-width="1.2"/></svg>`,
  // Капо Коррадо — додатковий крок (чоботи з крилами)
  capo_corrado: `<svg viewBox="0 0 48 48" fill="none"><path d="M16 14h16v18c0 2-3 4-8 4s-8-2-8-4z" fill="rgba(241,196,15,0.08)" stroke="#f1c40f" stroke-width="1.3"/><path d="M16 26h16" stroke="#f1c40f" stroke-width="0.8" opacity="0.4"/><path d="M12 36l4-2v4l-4 2z" fill="rgba(241,196,15,0.15)" stroke="#f1c40f" stroke-width="1"/><path d="M36 36l-4-2v4l4 2z" fill="rgba(241,196,15,0.15)" stroke="#f1c40f" stroke-width="1"/><path d="M8 18c2-2 4-3 8-4" stroke="#f1c40f" stroke-width="1" opacity="0.6"/><path d="M6 22c2-1 4-2 10-3" stroke="#f1c40f" stroke-width="1" opacity="0.4"/><path d="M40 18c-2-2-4-3-8-4" stroke="#f1c40f" stroke-width="1" opacity="0.6"/><path d="M42 22c-2-1-4-2-10-3" stroke="#f1c40f" stroke-width="1" opacity="0.4"/><path d="M22 8l2-4 2 4" stroke="#f1c40f" stroke-width="1.2"/></svg>`,
  // Міккі «Відступник» — без хабарів поліції (перекреслений значок поліції)
  mickey_renegade: `<svg viewBox="0 0 48 48" fill="none"><path d="M24 8l4 6h6l-2 6 4 5h-6l-6 4-6-4H8l4-5-2-6h6z" fill="rgba(52,152,219,0.1)" stroke="#3498db" stroke-width="1.3"/><circle cx="24" cy="22" r="4" fill="rgba(52,152,219,0.15)" stroke="#3498db" stroke-width="1"/><text x="24" y="25" text-anchor="middle" fill="#3498db" font-size="6" font-weight="700">P</text><line x1="12" y1="38" x2="36" y2="8" stroke="#e74c3c" stroke-width="2" opacity="0.7"/><circle cx="36" cy="38" r="6" fill="rgba(46,204,113,0.15)" stroke="#2ecc71" stroke-width="1"/><text x="36" y="41" text-anchor="middle" fill="#2ecc71" font-size="7" font-weight="700">+$</text></svg>`,
  // Малюк Флеммі — контратака (кулак зі зіркою удару)
  baby_flemmi: `<svg viewBox="0 0 48 48" fill="none"><path d="M18 32l-2-6 4-2v-6l4 2 4-4 2 6 4-1-1 5 4 4-4 2v4l-5-2-4 3-2-5z" fill="rgba(231,76,60,0.1)" stroke="#e74c3c" stroke-width="1.2"/><circle cx="24" cy="24" r="6" fill="rgba(231,76,60,0.15)" stroke="#e74c3c" stroke-width="1.2"/><path d="M22 22l4 4M26 22l-4 4" stroke="#e74c3c" stroke-width="1.5"/><path d="M10 14l4 2M8 20h4M10 26l4-2" stroke="#e74c3c" stroke-width="1" opacity="0.4"/><path d="M38 14l-4 2M40 20h-4M38 26l-4-2" stroke="#e74c3c" stroke-width="1" opacity="0.4"/></svg>`,
  // Томмі Морелло — дешевша повага (корона зі знижкою)
  tommy_morello: `<svg viewBox="0 0 48 48" fill="none"><path d="M12 28l4-12 4 6 4-8 4 8 4-6 4 12z" fill="rgba(241,196,15,0.15)" stroke="#f1c40f" stroke-width="1.5"/><rect x="12" y="28" width="24" height="4" rx="1" fill="rgba(241,196,15,0.1)" stroke="#f1c40f" stroke-width="1.2"/><circle cx="20" cy="30" r="1" fill="#f1c40f"/><circle cx="24" cy="30" r="1" fill="#f1c40f"/><circle cx="28" cy="30" r="1" fill="#f1c40f"/><circle cx="34" cy="40" r="6" stroke="#2ecc71" stroke-width="1.2" fill="rgba(46,204,113,0.12)"/><text x="34" y="43" text-anchor="middle" fill="#2ecc71" font-size="8" font-weight="700">-$</text></svg>`,
  // Ніккі «Король» — подвійні карти мафії (корона + карти)
  nikki_king: `<svg viewBox="0 0 48 48" fill="none"><path d="M16 18l4-8 4 5 4-5 4 8" stroke="#f1c40f" stroke-width="1.5" fill="rgba(241,196,15,0.1)"/><rect x="16" y="18" width="16" height="3" rx="1" fill="rgba(241,196,15,0.15)" stroke="#f1c40f" stroke-width="1"/><rect x="12" y="26" width="11" height="16" rx="2" fill="rgba(155,89,182,0.1)" stroke="#9b59b6" stroke-width="1.2" transform="rotate(-8 17 34)"/><rect x="25" y="26" width="11" height="16" rx="2" fill="rgba(155,89,182,0.1)" stroke="#9b59b6" stroke-width="1.2" transform="rotate(8 30 34)"/><text x="17" y="37" text-anchor="middle" fill="#9b59b6" font-size="8" font-weight="700" transform="rotate(-8 17 37)">M</text><text x="31" y="37" text-anchor="middle" fill="#9b59b6" font-size="8" font-weight="700" transform="rotate(8 31 37)">?</text></svg>`,
  // Живучий Джо — виживає один раз (щит з серцем)
  survivor_joe: `<svg viewBox="0 0 48 48" fill="none"><path d="M24 6c-8 0-14 6-14 12 0 12 14 24 14 24s14-12 14-24c0-6-6-12-14-12z" fill="rgba(46,204,113,0.08)" stroke="#2ecc71" stroke-width="1.5"/><path d="M24 16c-2-3-6-3-7 0s1 6 7 10c6-4 8-7 7-10s-5-3-7 0z" fill="rgba(231,76,60,0.2)" stroke="#e74c3c" stroke-width="1.2"/><text x="24" y="36" text-anchor="middle" fill="#2ecc71" font-size="6" font-weight="700">×1</text></svg>`,
  // «Сталевий» Ронні — подвійний відкуп (подвійний щит з $)
  steel_ronnie: `<svg viewBox="0 0 48 48" fill="none"><rect x="8" y="12" width="14" height="20" rx="3" fill="rgba(149,165,166,0.1)" stroke="#95a5a6" stroke-width="1.5"/><rect x="26" y="12" width="14" height="20" rx="3" fill="rgba(149,165,166,0.1)" stroke="#95a5a6" stroke-width="1.5"/><text x="15" y="25" text-anchor="middle" fill="#95a5a6" font-size="10" font-weight="700">$</text><text x="33" y="25" text-anchor="middle" fill="#95a5a6" font-size="10" font-weight="700">$</text><path d="M20 36l4 6 4-6" stroke="#e74c3c" stroke-width="1.5" fill="rgba(231,76,60,0.1)"/><text x="24" y="40" text-anchor="middle" fill="#e74c3c" font-size="6" font-weight="700">×2</text></svg>`,
  // Донні Анджело — дешевший вплив (герб з діамантом)
  donnie_angelo: `<svg viewBox="0 0 48 48" fill="none"><path d="M24 6l16 12v14c0 6-8 12-16 12S8 38 8 32V18z" fill="rgba(142,68,173,0.08)" stroke="#8e44ad" stroke-width="1.5"/><path d="M24 16l6 8-6 8-6-8z" fill="rgba(142,68,173,0.15)" stroke="#8e44ad" stroke-width="1.2"/><circle cx="24" cy="24" r="2" fill="#8e44ad"/><text x="24" y="42" text-anchor="middle" fill="#8e44ad" font-size="6" font-weight="700">-500$</text></svg>`,
  // Марко «Гравець» — бонус у BAR (карти + коктейль)
  marco_player: `<svg viewBox="0 0 48 48" fill="none"><rect x="8" y="12" width="12" height="18" rx="2" fill="rgba(231,76,60,0.1)" stroke="#e74c3c" stroke-width="1.2" transform="rotate(-12 14 21)"/><rect x="20" y="12" width="12" height="18" rx="2" fill="rgba(44,62,80,0.15)" stroke="#2c3e50" stroke-width="1.2" transform="rotate(12 26 21)"/><text x="13" y="24" text-anchor="middle" fill="#e74c3c" font-size="9" font-weight="700" transform="rotate(-12 13 24)">A</text><text x="27" y="24" text-anchor="middle" fill="#ecf0f1" font-size="9" font-weight="700" transform="rotate(12 27 24)">K</text><path d="M34 30l2 12h-6l2-12z" fill="rgba(46,204,113,0.15)" stroke="#2ecc71" stroke-width="1"/><circle cx="35" cy="28" r="3" fill="rgba(46,204,113,0.1)" stroke="#2ecc71" stroke-width="0.8"/></svg>`
};

const CHARACTER_DATA = [
  { id: 'eddie', name: 'Едді «Божевільний»', color: '#e74c3c', title: 'Вуличний боєць' },
  { id: 'carlo', name: 'Карло «Бритва»', color: '#2980b9', title: 'Старий лис' },
  { id: 'vinnie', name: 'Вінні «Кулак»', color: '#2ecc71', title: 'Зелений барон' },
  { id: 'sal', name: 'Сальваторе «Золото»', color: '#f1c40f', title: 'Золотий король' },
  { id: 'niko', name: 'Ніко «Тінь»', color: '#9b59b6', title: 'Тіньовий владика' },
  { id: 'rosa', name: 'Донна Роза', color: '#e91e90', title: 'Залізна леді' },
  { id: 'tommy', name: 'Томмі «Динаміт»', color: '#e67e22', title: 'Вогняний темперамент' },
  { id: 'frankie', name: 'Френкі «Лід»', color: '#00bcd4', title: 'Холодний розрахунок' }
];

// --- DOM ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const lobbyScreen = $('#lobby-screen');
const waitingScreen = $('#waiting-screen');
const gameScreen = $('#game-screen');

// ===== SOUND SYSTEM =====
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) audioCtx = new AudioCtx();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, duration, type = 'sine', vol = 0.15) {
  try {
    ensureAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch(e) {}
}

function playNoise(duration, vol = 0.08) {
  try {
    ensureAudio();
    const bufferSize = audioCtx.sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    source.connect(gain);
    gain.connect(audioCtx.destination);
    source.start();
  } catch(e) {}
}

const SFX = {
  diceRoll() { for (let i = 0; i < 6; i++) setTimeout(() => playNoise(0.05, 0.12), i * 50); setTimeout(() => playTone(800, 0.15, 'sine', 0.1), 300); },
  buy() { playTone(523, 0.1, 'sine', 0.12); setTimeout(() => playTone(659, 0.1, 'sine', 0.12), 80); setTimeout(() => playTone(784, 0.15, 'sine', 0.12), 160); },
  rent() { playTone(330, 0.15, 'triangle', 0.1); setTimeout(() => playTone(262, 0.2, 'triangle', 0.1), 120); },
  attack() { playNoise(0.3, 0.2); playTone(150, 0.4, 'sawtooth', 0.15); setTimeout(() => playTone(80, 0.5, 'sawtooth', 0.1), 200); },
  casino() { for (let i = 0; i < 10; i++) setTimeout(() => playTone(400 + Math.random() * 400, 0.08, 'sine', 0.06), i * 100); },
  win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.2, 'sine', 0.12), i * 120)); },
  lose() { playTone(330, 0.2, 'sawtooth', 0.1); setTimeout(() => playTone(262, 0.3, 'sawtooth', 0.1), 200); },
  mafia() { playTone(220, 0.3, 'triangle', 0.1); setTimeout(() => playTone(277, 0.3, 'triangle', 0.1), 200); },
  event() { playTone(440, 0.1, 'sine', 0.08); setTimeout(() => playTone(554, 0.15, 'sine', 0.08), 100); },
  click() { playTone(1000, 0.05, 'sine', 0.06); },
  prison() { playTone(100, 0.5, 'square', 0.08); setTimeout(() => playNoise(0.2, 0.1), 100); },
  jackpot() { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => setTimeout(() => playTone(f, 0.3, 'sine', 0.15), i * 100)); },
  cardReveal() { playTone(350, 0.15, 'triangle', 0.1); setTimeout(() => playTone(500, 0.2, 'triangle', 0.12), 150); setTimeout(() => playTone(700, 0.15, 'sine', 0.1), 300); },
  victory() { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => playTone(f, 0.4, 'sine', 0.18), i * 200)); },

  // Token move — short tick for each cell step during own movement
  tokenTick() { playTone(1200, 0.04, 'sine', 0.1); },

  // Other player move — softer, lower-pitched tick
  tokenTickOther() { playTone(800, 0.04, 'triangle', 0.05); },

  // Buy business — ka-ching cash register
  kaChing() {
    playTone(1200, 0.08, 'square', 0.1);
    setTimeout(() => playTone(1500, 0.06, 'square', 0.1), 70);
    setTimeout(() => { playTone(2000, 0.15, 'sine', 0.12); playNoise(0.08, 0.06); }, 130);
    setTimeout(() => playTone(2400, 0.2, 'sine', 0.08), 200);
  },

  // Pay rent — sad coins dropping
  payRent() {
    [600, 500, 400, 300, 250].forEach((f, i) => setTimeout(() => {
      playTone(f, 0.1, 'triangle', 0.08);
      playNoise(0.03, 0.04);
    }, i * 80));
  },

  // Go to prison — heavy door slam + lock
  prisonDoor() {
    playNoise(0.15, 0.2);
    playTone(60, 0.4, 'sawtooth', 0.18);
    setTimeout(() => { playTone(40, 0.3, 'square', 0.15); playNoise(0.1, 0.15); }, 200);
    setTimeout(() => playTone(300, 0.08, 'sine', 0.1), 450); // lock click
    setTimeout(() => playTone(250, 0.06, 'sine', 0.08), 500);
  },

  // Level up respect — triumphant fanfare
  respectUp() {
    [392, 494, 587, 784].forEach((f, i) => setTimeout(() => playTone(f, 0.25, 'sine', 0.14), i * 130));
    setTimeout(() => playTone(784, 0.5, 'triangle', 0.1), 520);
    setTimeout(() => playTone(988, 0.4, 'sine', 0.12), 650);
  },

  // Helper hired — mysterious reveal
  helperReveal() {
    playTone(220, 0.2, 'sine', 0.06);
    setTimeout(() => playTone(277, 0.2, 'sine', 0.08), 150);
    setTimeout(() => playTone(330, 0.2, 'sine', 0.1), 300);
    setTimeout(() => playTone(440, 0.3, 'triangle', 0.12), 450);
    setTimeout(() => playTone(554, 0.35, 'sine', 0.1), 600);
  },

  // Card flip — quick swoosh
  cardFlip() {
    try {
      ensureAudio();
      const bufLen = audioCtx.sampleRate * 0.12;
      const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        const t = i / audioCtx.sampleRate;
        d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - t * 12) * 0.15;
      }
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      const filt = audioCtx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.setValueAtTime(3000, audioCtx.currentTime);
      filt.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.12);
      filt.Q.value = 1.5;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.2, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
      src.connect(filt);
      filt.connect(g);
      g.connect(audioCtx.destination);
      src.start();
    } catch(e) {}
  },

  // Turn start — subtle notification ding
  turnStart() {
    playTone(880, 0.08, 'sine', 0.1);
    setTimeout(() => playTone(1175, 0.12, 'sine', 0.12), 100);
    setTimeout(() => playTone(1760, 0.15, 'sine', 0.08), 200);
  },

  // Victory — epic win fanfare
  epicVictory() {
    // Drum roll intro
    for (let i = 0; i < 8; i++) setTimeout(() => playNoise(0.04, 0.06 + i * 0.01), i * 50);
    // Fanfare melody
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.35, 'sine', 0.16), 400 + i * 180));
    // Final triumphant chord
    setTimeout(() => {
      playTone(1047, 0.6, 'sine', 0.14);
      playTone(1319, 0.6, 'sine', 0.12);
      playTone(1568, 0.6, 'sine', 0.12);
      playTone(2093, 0.8, 'sine', 0.1);
    }, 1120);
  }
};

// ===== FX: reusable visual effects engine =====
// Shared helpers so every card play / event gets a polished effect
// without each site reinventing particles, flying coins, shimmers, etc.
// Note: .attack-effect-* classes in style.css are reused for burst.
const FX = {
  _safe(s) {
    const d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  },

  // Centered icon burst: big icon, title, subtitle, particles, shockwave ring.
  // Great for "this happened!" moments (card played, protected, etc.)
  burst({ icon = '★', title = '', subtitle = '', color = '#c9a84c', duration = 2400, sound = null } = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'attack-effect-overlay fx-burst';
    overlay.style.setProperty('--effect-color', color);
    overlay.innerHTML = `
      <div class="attack-effect-flash"></div>
      <div class="attack-effect-ring"></div>
      <div class="attack-effect-icon">${this._safe(icon)}</div>
      <div class="attack-effect-title">${this._safe(title)}</div>
      <div class="attack-effect-subtitle">${this._safe(subtitle)}</div>
    `;
    const palette = [color, '#ffffff', color + 'aa'];
    for (let i = 0; i < 18; i++) {
      const p = document.createElement('div');
      p.className = 'attack-effect-particle';
      const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.1;
      const dist = 70 + Math.random() * 160;
      p.style.setProperty('--px', Math.cos(angle) * dist + 'px');
      p.style.setProperty('--py', Math.sin(angle) * dist + 'px');
      p.style.left = '50%';
      p.style.top = '50%';
      p.style.background = palette[Math.floor(Math.random() * palette.length)];
      const size = 3 + Math.random() * 5;
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.animationDelay = (Math.random() * 0.3) + 's';
      overlay.appendChild(p);
    }
    document.body.appendChild(overlay);
    if (typeof sound === 'function') { try { sound(); } catch (e) {} }
    setTimeout(() => overlay.remove(), duration);
  },

  // Coins fly between two DOM elements. Useful for rent, robbery, blackmail, tax.
  moneyFlow(fromEl, toEl, label = '', color = '#2ecc71') {
    if (!fromEl || !toEl) return;
    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    const bx = b.left + b.width / 2, by = b.top + b.height / 2;
    const layer = document.createElement('div');
    layer.className = 'fx-money-layer';
    for (let i = 0; i < 8; i++) {
      const coin = document.createElement('div');
      coin.className = 'fx-coin';
      coin.textContent = '$';
      coin.style.left = ax + 'px';
      coin.style.top = ay + 'px';
      coin.style.color = color;
      coin.style.setProperty('--tx', (bx - ax) + 'px');
      coin.style.setProperty('--ty', (by - ay) + 'px');
      coin.style.animationDelay = (i * 0.06) + 's';
      layer.appendChild(coin);
    }
    if (label) {
      const lbl = document.createElement('div');
      lbl.className = 'fx-money-label';
      lbl.textContent = label;
      lbl.style.left = ((ax + bx) / 2) + 'px';
      lbl.style.top = ((ay + by) / 2 - 24) + 'px';
      lbl.style.color = color;
      layer.appendChild(lbl);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 1800);
    try { SFX.payRent(); } catch (e) {}
  },

  // Color shimmer sweep across an element — for defenses, buffs.
  shimmer(el, color = '#f1c40f', duration = 1200) {
    if (!el) return;
    el.classList.add('fx-shimmer');
    el.style.setProperty('--shimmer-color', color);
    setTimeout(() => {
      el.classList.remove('fx-shimmer');
      el.style.removeProperty('--shimmer-color');
    }, duration);
  },

  // Small bottom-center toast with icon — subtle announcements that
  // don't deserve a full burst.
  toast(icon, text, color = '#c9a84c', duration = 2400) {
    const t = document.createElement('div');
    t.className = 'fx-toast';
    t.style.setProperty('--fx-color', color);
    t.innerHTML = `<span class="fx-toast-icon">${this._safe(icon)}</span><span class="fx-toast-text">${this._safe(text)}</span>`;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('fx-toast-show'));
    setTimeout(() => {
      t.classList.remove('fx-toast-show');
      setTimeout(() => t.remove(), 350);
    }, duration);
  }
};

// Dispatches visual feedback for a successfully played MAFIA card.
// Called from the playMafiaCard callback on the client: if the server
// returned an error we fall through to the existing handleResult,
// otherwise we map the result.type → burst / toast / moneyFlow.
function showCardPlayFX(cardId, res) {
  if (!res || res.error) return;
  const myPanel = () => document.querySelector(`[data-player-id="${myId}"]`) || document.querySelector('.player-panel.me');
  switch (cardId) {
    case 'tax_collector':
      FX.burst({ icon: '💰', title: 'ЗБИРАЧ ДАНИНИ',
        subtitle: res.amount ? `Зібрано ${res.amount}$` : 'Усі платять',
        color: '#f1c40f', duration: 2200, sound: () => SFX.payRent() });
      break;
    case 'sabotage':
      FX.burst({ icon: '💥', title: 'САБОТАЖ',
        subtitle: 'Вплив знищено', color: '#e67e22', duration: 2000,
        sound: () => SFX.attack() });
      break;
    case 'blackmail':
      FX.burst({ icon: '✉', title: 'ШАНТАЖ',
        subtitle: res.amount ? `Здобуто ${res.amount}$` : 'Жертва заплатила',
        color: '#9b59b6', duration: 2200, sound: () => SFX.payRent() });
      break;
    case 'rumors':
      FX.toast('🗣', 'Чутки поширено — -1 поваги цілі', '#b59c4e', 2400);
      break;
    case 'kompromat':
      FX.burst({ icon: '📁', title: 'КОМПРОМАТ',
        subtitle: "Ціль у в'язниці на 2 ходи",
        color: '#c0392b', duration: 2200, sound: () => SFX.prisonDoor() });
      break;
    case 'bomb':
      FX.toast('💣', 'Бомбу встановлено на поточному секторі', '#e74c3c', 2400);
      break;
    case 'lawyer':
      FX.toast('⚖', "Адвокат — ви на волі!", '#c9a84c', 2200);
      break;
    case 'robbery':
      FX.burst({ icon: '🎯', title: 'ПОГРАБУВАННЯ',
        subtitle: 'Власник заплатив вам', color: '#e67e22', duration: 2000,
        sound: () => SFX.payRent() });
      break;
    case 'raider':
      FX.burst({ icon: '🏚', title: 'РЕЙДЕРСЬКЕ ЗАХОПЛЕННЯ',
        subtitle: 'Бізнес ваш', color: '#d35400', duration: 2200 });
      break;
    case 'pogrom':
      FX.burst({ icon: '🔥', title: 'ПОГРОМ',
        subtitle: 'Бізнес повернувся на ринок', color: '#e74c3c', duration: 2200,
        sound: () => SFX.attack() });
      break;
    case 'corruption':
      FX.shimmer(myPanel(), '#f1c40f', 1400);
      FX.toast('🤝', 'Корупція активна на 3 ходи', '#f1c40f', 2400);
      break;
    case 'money_laundering':
      FX.shimmer(myPanel(), '#2ecc71', 1400);
      FX.toast('💵', 'Подвійний дохід з бізнесів на 1 коло', '#2ecc71', 2400);
      break;
    case 'witness_protection':
      FX.shimmer(myPanel(), '#3498db', 1400);
      FX.toast('🛡', '2 ходи недоторканності', '#3498db', 2400);
      break;
    case 'insurance':
      FX.toast('🧾', res.amount ? `Повернуто ${res.amount}$` : 'Страховка спрацювала', '#2ecc71', 2400);
      break;
    case 'hostile_takeover':
      FX.burst({ icon: '🏢', title: 'ВОРОЖЕ ПОГЛИНАННЯ',
        subtitle: res.cost ? `Сплачено ${res.cost}$` : 'Бізнес ваш',
        color: '#c9a84c', duration: 2400, sound: () => SFX.buy() });
      break;
    case 'lucky_shirt':
      FX.shimmer(myPanel(), '#f1c40f', 1400);
      FX.toast('🍀', 'Народжений у сорочці — бомба не страшна', '#f1c40f', 2400);
      break;
  }
}

// Shortcut for card handlers: shows FX on success, or the error toast on failure.
function handleCardResult(cardId, res) {
  if (res && res.error) return handleResult(res);
  showCardPlayFX(cardId, res);
}

// ===== SVG ICONS for businesses =====
const BIZ_ICONS = {
  kiosk: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 7h16v13H4zM7 7V4h10v3M8 11h3M8 14h5"/><path d="M15 11h2v4h-2z"/></svg>`,
  shawarma: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2C8 2 5 5 5 8c0 2 1 3.5 2 4.5V21h10v-8.5c1-1 2-2.5 2-4.5 0-3-3-6-7-6z"/><path d="M9 12h6M9 15h6M9 18h6"/></svg>`,
  lombard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="7" r="4"/><circle cx="8" cy="14" r="3"/><circle cx="16" cy="14" r="3"/><path d="M4 21h16"/></svg>`,
  avto_moyka: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 17h14V9H5zM7 9l2-5h6l2 5M7.5 17v2M16.5 17v2"/><path d="M3 5l2 1M12 3v2M21 5l-2 1"/></svg>`,
  barbershop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 3v18M4 3c2 2 2 4 0 6s-2 4 0 6 2 4 0 6"/><path d="M8 6h8a4 4 0 010 8H8"/><circle cx="16" cy="10" r="1"/></svg>`,
  taksopark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 17h14v-5H5zM5 12l2-6h10l2 6M7.5 17v2M16.5 17v2M8 14h.01M16 14h.01"/><rect x="9" y="2" width="6" height="3"/></svg>`,
  pitseria: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L2 20h20L12 2z"/><circle cx="10" cy="13" r="1.5"/><circle cx="14" cy="16" r="1.5"/><circle cx="12" cy="9" r="1"/></svg>`,
  apteka: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v8M8 12h8"/></svg>`,
  supermarket: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 8h14M10 21a1 1 0 100-2 1 1 0 000 2zM18 21a1 1 0 100-2 1 1 0 000 2z"/></svg>`,
  avtoservis: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.6-3.6a5.5 5.5 0 01-7.6 7.6L6 21l-3-3 7.7-7.7a5.5 5.5 0 017.6-7.6L14.7 6.3z"/></svg>`,
  sklad: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 21V8l8-5 8 5v13H4z"/><path d="M4 8h16"/><rect x="8" y="12" width="8" height="4"/><path d="M12 12v4"/></svg>`,
  drukarnya: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M12 9v6M9 12h6M6 12h.01M18 12h.01"/></svg>`,
  avtosalon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 17h14v-5H5zM5 12l2-6h10l2 6M7 17v2M17 17v2M8 14h.01M16 14h.01"/><path d="M9 6l1-4h4l1 4"/></svg>`,
  hotel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 21h18M5 21V3h14v18"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-4h4v4"/></svg>`,
  telestudiya: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M8 3l4 4 4-4"/><circle cx="12" cy="14" r="3"/></svg>`,
  spa: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22c-4-2-8-6-8-11a8 8 0 0116 0c0 5-4 9-8 11z"/><path d="M12 2v4M8 6l2 2M16 6l-2 2"/></svg>`,
  restoran: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2M7 2v20M21 15V2c-2.5 0-5 2-5 5v6h3v7h2"/></svg>`,
  yacht_club: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 20l2-2c2-2 4-2 6 0s4 2 6 0 4-2 6 0l2 2"/><path d="M12 16V4M12 4L6 16h12L12 4z"/></svg>`,
  night_club: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/><path d="M3 2l3 3M21 2l-3 3"/></svg>`,
  lounge_bar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2h8l-3 8v5h4v2H7v-2h4v-5L8 2z"/><path d="M6 2h12"/><circle cx="17" cy="6" r="2"/></svg>`,
  casino: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><circle cx="16" cy="9" r="1.5"/><circle cx="8" cy="15" r="1.5"/><circle cx="16" cy="15" r="1.5"/><circle cx="12" cy="12" r="1.5"/></svg>`,
  bank: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 21h18M3 10h18M12 3l9 7H3l9-7zM5 10v8M9 10v8M15 10v8M19 10v8"/></svg>`,
  hedge_fund: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/><path d="M17 9h3v3"/></svg>`,
  skyscraper: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 21h18M7 21V6l5-4 5 4v15"/><path d="M10 10h4M10 14h4M10 18h4M10 7h4"/></svg>`
};

// Special cell SVG icons
const SPECIAL_ICONS = {
  START: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="5,3 19,12 5,21"/></svg>`,
  POLICE: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 1l2 5h5l-4 3 1.5 5L12 11l-4.5 3L9 9 5 6h5z"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>`,
  PRISON: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 3v18M12 3v18M16 3v18"/></svg>`,
  BAR: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2h8l-3 8v5h4v2H7v-2h4v-5L8 2z"/><path d="M6 2h12"/></svg>`,
  MAFIA: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2C8 2 4 5 4 8c0 1.5.5 2.5 1 3.5L3 22h18l-2-10.5c.5-1 1-2 1-3.5 0-3-4-6-8-6z"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="9" r="1"/></svg>`,
  EVENT: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r=".5"/></svg>`
};

// ===== SCREEN MANAGEMENT =====
function showScreen(screen) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

// ===== MODE SELECTOR =====
if (!isTVMode && !isPhoneMode) {
  document.addEventListener('DOMContentLoaded', () => {
    const modeSelector = $('#mode-selector');
    const tvModeSelector = $('#tv-mode-selector');
    const classicLobby = $('#classic-lobby');

    // Classic mode
    $('#mode-classic')?.addEventListener('click', () => {
      modeSelector.style.display = 'none';
      classicLobby.style.display = '';
    });

    // TV mode sub-selector
    $('#mode-tv-select')?.addEventListener('click', () => {
      modeSelector.style.display = 'none';
      tvModeSelector.style.display = '';
    });

    // TV Host (big screen) — redirect to TV mode
    $('#mode-tv-host')?.addEventListener('click', () => {
      window.location.href = '/?mode=tv';
    });

    // TV Phone (controller) — redirect to phone mode
    $('#mode-tv-phone')?.addEventListener('click', () => {
      window.location.href = '/?mode=phone';
    });

    // Back buttons
    $('#mode-tv-back')?.addEventListener('click', () => {
      tvModeSelector.style.display = 'none';
      modeSelector.style.display = '';
    });
    $('#classic-back')?.addEventListener('click', () => {
      classicLobby.style.display = 'none';
      modeSelector.style.display = '';
    });
  });
}

// ===== LOBBY =====
$('#btn-create').addEventListener('click', () => {
  SFX.click();
  const name = $('#player-name').value.trim();
  if (!name) return showError("Введіть ім'я!");
  socket.emit('createRoom', { playerName: name }, (res) => {
    if (res.error) return showError(res.error);
    myId = res.playerId;
    myRoomId = res.roomId;
    if (res.rejoinToken) sessionStorage.setItem('mafia_rejoinToken', res.rejoinToken);
    showWaiting(res.roomId);
  });
});

$('#btn-join').addEventListener('click', () => {
  SFX.click();
  const name = $('#player-name').value.trim();
  const code = $('#room-code').value.trim().toUpperCase();
  if (!name) return showError("Введіть ім'я!");
  if (!code) return showError('Введіть код кімнати!');
  socket.emit('joinRoom', { roomId: code, playerName: name }, (res) => {
    if (res.error) return showError(res.error);
    myId = res.playerId;
    myRoomId = res.roomId;
    if (res.rejoinToken) sessionStorage.setItem('mafia_rejoinToken', res.rejoinToken);
    showWaiting(res.roomId);
  });
});

function showError(msg) { $('#lobby-error').textContent = msg; }

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatUiText(text) {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

function showEventNotice(message, tone = 'info', duration = 2400) {
  if (!message) return;
  showEventDisplay(`<p class="event-note event-note-${tone}">${formatUiText(message)}</p>`, duration);
}

function notifyUser(message, {
  tone = 'info',
  title = '',
  icon,
  duration = 2400,
  center = false,
  event = true
} = {}) {
  if (!message) return;
  const toneMap = {
    error: { icon: '⚠', color: '#e86b6b' },
    success: { icon: '✓', color: '#3ecf8e' },
    info: { icon: 'ℹ', color: '#c9a84c' },
    pending: { icon: '⏳', color: '#7bb6ff' }
  };
  const cfg = toneMap[tone] || toneMap.info;
  FX.toast(icon || cfg.icon, message, cfg.color, duration);
  if (event) showEventNotice(message, tone, duration);
  if (center) showCenterMessage(title || message, message, duration);
}

function notifyError(message, options = {}) {
  notifyUser(message, { tone: 'error', title: 'Дію відхилено', ...options });
}

function notifySuccess(message, options = {}) {
  notifyUser(message, { tone: 'success', ...options });
}

function showWaiting(roomId) {
  showScreen(waitingScreen);
  $('#room-id-display').textContent = roomId;
  sessionStorage.setItem('mafia_roomId', roomId);
  const name = $('#player-name').value.trim();
  if (name) sessionStorage.setItem('mafia_playerName', name);
}

$('#btn-start').addEventListener('click', () => {
  SFX.click();
  const minRound = parseInt($('#setting-min-round').textContent) || 3;
  socket.emit('startGame', { mafiaCardMinRound: minRound }, (res) => {
    handleResult(res, { title: 'Старт матчу' });
  });
});

$('#btn-add-bot').addEventListener('click', () => {
  SFX.click();
  socket.emit('addBot', {}, (res) => {
    handleResult(res, { title: 'Додавання бота' });
  });
});

// Setting controls (+ / -)
document.querySelectorAll('.btn-setting-plus').forEach(btn => {
  btn.addEventListener('click', () => {
    SFX.click();
    const target = document.getElementById(btn.dataset.target);
    let val = parseInt(target.textContent) || 1;
    if (val < 10) target.textContent = val + 1;
  });
});
document.querySelectorAll('.btn-setting-minus').forEach(btn => {
  btn.addEventListener('click', () => {
    SFX.click();
    const target = document.getElementById(btn.dataset.target);
    let val = parseInt(target.textContent) || 1;
    if (val > 1) target.textContent = val - 1;
  });
});

// ===== SOCKET EVENTS =====
socket.on('gameState', (state) => {
  // Branch for TV/Phone modes
  if (isTVMode) { renderTVState(state); return; }
  if (isPhoneMode) { renderPhoneState(state); return; }

  const prevState = gameState;
  gameState = state;
  if (state.phase === 'waiting') {
    renderWaitingRoom(state);
  } else if (state.phase === 'rolling_order') {
    showScreen(gameScreen);
    renderOrderRollPhase(state);
  } else if (state.phase === 'finished') {
    showScreen(gameScreen);
    renderGame(state, true); // skip pending action
    // Close any leftover pending modals/overlays so they don't cover victory screen
    try { hideModal(); } catch(e) {}
    try { hideCenterPanel(); } catch(e) {}
    try {
      const auction = document.getElementById('auction-overlay');
      if (auction) auction.classList.remove('active');
      if (auctionTimerInterval) { clearInterval(auctionTimerInterval); auctionTimerInterval = null; }
    } catch(e) {}
    document.querySelectorAll('.hidden-helper-overlay, .bomb-picker-overlay, .trade-overlay').forEach(el => el.remove());
    showEnhancedVictoryScreen(state);
  } else {
    // Check if we're animating — delay pending action display
    const now = Date.now();
    const waitMs = pendingActionDelay > now ? (pendingActionDelay - now) : 0;

    if (waitMs > 0 && state.pendingAction && state.pendingAction.playerId === myId) {
      // Render board without pending action, then show it after animation
      showScreen(gameScreen);
      renderGame(state, true); // skip pending actions
      setTimeout(() => {
        if (gameState === state) handlePendingAction(state);
      }, waitMs);
    } else {
      showScreen(gameScreen);
      renderGame(state, false);
    }

    // Show latest log entry in center for other players' actions
    if (prevState && state.log && state.log.length > 0) {
      const latestLog = state.log[state.log.length - 1];
      const current = state.players[state.currentPlayerIndex];
      if (current && current.id !== myId && latestLog) {
        showCenterMessage(current.name, latestLog.message, 3000);
      }
    }
  }

  // Animate money changes
  if (state.players) {
    for (const p of state.players) {
      if (prevMoney[p.id] !== undefined && prevMoney[p.id] !== p.money) {
        const diff = p.money - prevMoney[p.id];
        showMoneyAnimation(p.id, diff);
      }
      prevMoney[p.id] = p.money;
    }
  }

  // Animate bot/other player token movement
  if (state.players && state.phase === 'playing') {
    for (const p of state.players) {
      if (p.id !== myId && prevPositions[p.id] !== undefined && prevPositions[p.id] !== p.position) {
        const fromPos = prevPositions[p.id];
        const toPos = p.position;
        animateTokenMovement(p.id, fromPos, toPos);
      }
    }
  }

  // Update previous positions for animation tracking
  if (state.players) {
    for (const p of state.players) {
      prevPositions[p.id] = p.position;
    }
  }

  // Detect turn change — play turn start sound when it becomes my turn
  if (state.phase === 'playing' && state.currentPlayerId === myId && prevCurrentPlayerId !== myId && prevCurrentPlayerId !== null) {
    SFX.turnStart();
  }
  if (state.phase === 'playing') {
    prevCurrentPlayerId = state.currentPlayerId;
  }

  // Detect player death — show kill animation
  if (prevState && prevState.players && state.players && state.phase === 'playing') {
    for (const p of state.players) {
      const prev = prevState.players.find(pp => pp.id === p.id);
      if (prev && prev.alive && !p.alive) {
        // Check if death was from bomb (check latest log entries)
        const recentLogs = (state.log || []).slice(-3);
        const bombLog = recentLogs.find(l => l.message && (l.message.includes('бомб') || l.message.includes('підірв') || l.message.includes('вибух')));
        if (bombLog) {
          showExplosion(p.name);
        } else {
          showKillAnimation(p.name);
        }
      }
      // Detect prison — player just got sent to prison
      if (prev && prev.alive && p.alive && prev.inPrison === 0 && p.inPrison > 0) {
        showPrisonEffect(p.name, p.inPrison);
      }
    }
  }
});

socket.on('gameStarted', () => {
  if (isTVMode || isPhoneMode) return; // TV/Phone handle screen transitions via gameState
  showScreen(gameScreen);
});

socket.on('attackAlert', (data) => {
  SFX.attack();
  if (data.targetId === myId) {
    showAttackAlert(data);
  } else {
    showAttackNotification(data);
  }
});

socket.on('rentPaid', (data) => {
  if (data && data.payerName && data.ownerName) {
    showRentPaymentEffect(data.payerName, data.payerCharacter, data.ownerName, data.ownerCharacter, data.amount, data.businessName);
  }
});

socket.on('businessBought', (data) => {
  if (!data || !data.payerName || !data.businessName || !data.amount) return;
  const sourceLabel = data.source === 'auction'
    ? 'Аукціон'
    : (data.source === 'seize' ? 'Захоплення' : 'Купівля');
  showRentPaymentEffect(
    data.payerName,
    data.payerCharacter,
    'Банк',
    { color: '#c9a84c' },
    data.amount,
    `${sourceLabel}: ${data.businessName}`
  );
});

socket.on('bribePaid', (data) => {
  if (!data || !data.payerName || !data.amount) return;
  showRentPaymentEffect(
    data.payerName,
    data.payerCharacter,
    'Поліція',
    { color: '#4aa3ff' },
    data.amount,
    data.reason || 'Хабар поліції'
  );
});

socket.on('cardDrawn', (data) => {
  if (!data || !data.playerName) return;
  // Don't show to the player who drew the card (they have their own reveal)
  if (gameState) {
    const me = gameState.players.find(p => p.id === myId);
    if (me && me.name === data.playerName) return;
  }
  showCardDrawnEffect(data);
});

socket.on('attackOutcome', (result) => {
  if (!result || !result.type) return;
  switch (result.type) {
    case 'attack_blocked':
      if (result.by === 'vest') {
        showAttackEffect('shield', 'БРОНЕЖИЛЕТ!', 'Атаку відбито!', '#3498db');
      } else if (result.by === 'police') {
        showAttackEffect('police', 'ПОЛІЦІЯ!', 'Атакуючий їде у в\'язницю!', '#e67e22');
      }
      break;
    case 'attack_bought_off':
      showAttackEffect('money', 'ВІДКУП!', `Заплачено ${result.cost}$`, '#f1c40f');
      break;
    case 'attack_survived':
      if (result.by === 'survivor_joe') {
        showAttackEffect('hero', 'ЖИВУЧИЙ ДЖО!', 'Пожертвував собою заради боса!', '#2ecc71');
      }
      break;
    case 'poison_failed':
      showAttackEffect('fail', 'ОТРУТА НЕ СПРАЦЮВАЛА!', `Кубик: ${result.dice}`, '#9b59b6');
      break;
    case 'helper_killed':
      showAttackEffect('skull', `${result.helperName}`, 'Помічника вбито!', '#e74c3c');
      break;
  }
});

// ===== WAITING ROOM (up to 8 players) =====
const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#e91e63', '#e67e22', '#95a5a6'];
const PLAYER_INITIALS = ['E', 'D', 'L', 'S', 'V', 'M', 'Z', 'R'];

function renderOrderRollPhase(state) {
  const pipLayouts = { 1: [5], 2: [3,7], 3: [3,5,7], 4: [1,3,7,9], 5: [1,3,5,7,9], 6: [1,3,4,6,7,9] };
  function diceHtml(val) {
    const pips = pipLayouts[val] || [];
    return `<div class="die">${[1,2,3,4,5,6,7,8,9].map(i => `<div${pips.includes(i) ? ' class="die-pip"' : ''}></div>`).join('')}</div>`;
  }

  // Show roll order overlay
  const overlay = document.getElementById('roll-order-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';

  // Generate particles once
  const particlesEl = document.getElementById('ro-particles');
  if (particlesEl && particlesEl.children.length === 0) {
    for (let i = 0; i < 20; i++) {
      const p = document.createElement('div');
      p.className = 'ro-particle';
      const size = 2 + Math.random() * 4;
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.left = Math.random() * 100 + '%';
      p.style.animationDuration = (6 + Math.random() * 10) + 's';
      p.style.animationDelay = (Math.random() * 8) + 's';
      particlesEl.appendChild(p);
    }
  }

  // Hide game layout behind overlay
  const gameLayout = document.querySelector('.game-layout');
  if (gameLayout) gameLayout.style.visibility = 'hidden';

  // Build roll panel content
  const panel = document.getElementById('ro-panel');
  let html = `<h2>${ICON.dice} Хто ходить першим?</h2>`;

  for (const p of state.players) {
    const roll = state.orderRolls ? state.orderRolls[p.id] : null;
    const isCurrentRoller = state.orderRollCurrentId === p.id;
    const color = PLAYER_COLORS[state.players.indexOf(p)] || '#888';

    html += `<div class="ro-player-row ${isCurrentRoller ? 'current' : ''}">`;
    const charId = p.character?.id;
    html += charId && PORTRAITS[charId]
      ? `<div class="ro-player-avatar avatar-portrait" style="--char-color:${p.character.color}">${PORTRAITS[charId]}</div>`
      : `<div class="ro-player-avatar" style="background:${color}">${p.name[0]}</div>`;
    html += `<span class="ro-player-name">${p.name}</span>`;

    if (roll) {
      html += `<span style="display:flex;gap:4px">${diceHtml(roll.dice1)}${diceHtml(roll.dice2)}</span>`;
      html += `<span class="ro-player-result">= ${roll.total}</span>`;
    } else if (isCurrentRoller) {
      html += `<span class="ro-player-status" style="color:var(--gold)">кидає...</span>`;
    } else {
      html += `<span class="ro-player-status">очікує</span>`;
    }
    html += '</div>';
  }

  if (state.orderRollCurrentId === myId) {
    html += `<button id="btn-order-roll" class="btn btn-roll ro-roll-btn">${ICON.dice} КИНУТИ КУБИКИ</button>`;
  }

  panel.innerHTML = html;

  // Bind roll button
  const rollBtn = document.getElementById('btn-order-roll');
  if (rollBtn) {
    rollBtn.addEventListener('click', () => {
      rollBtn.disabled = true;
      rollBtn.innerHTML = `${ICON.dice} Кидаю...`;
      SFX.diceRoll();
      socket.emit('rollForOrder', {}, (res) => {
        if (res.error) {
          notifyError(res.error, { title: 'Кидок для черги' });
          rollBtn.disabled = false;
          rollBtn.innerHTML = `${ICON.dice} КИНУТИ КУБИКИ`;
        }
      });
    });
  }
}

function renderWaitingRoom(state) {
  const list = $('#players-list');
  list.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const p = state.players[i];
    const slot = document.createElement('div');
    slot.className = `player-slot ${p ? 'filled' : ''}`;
    if (p) {
      const charId = p.character?.id;
      const charColor = p.character?.color || PLAYER_COLORS[i];
      const portrait = charId && PORTRAITS[charId]
        ? `<div class="avatar avatar-portrait" style="--char-color:${charColor}">${PORTRAITS[charId]}</div>`
        : `<div class="avatar" style="background:${charColor}">${p.name[0].toUpperCase()}</div>`;
      slot.innerHTML = `
        ${portrait}
        <div class="pname">${p.name}</div>
      `;
    } else {
      slot.innerHTML = '<div style="color:var(--text-muted);font-size:24px">+</div><div class="pname" style="color:var(--text-muted)">Очікує...</div>';
    }
    list.appendChild(slot);
  }

  // --- Character select grid ---
  const grid = document.getElementById('character-select');
  if (grid) {
    const takenCharIds = state.players.map(p => p.character?.id).filter(Boolean);
    const me = state.players.find(p => p.id === myId);
    const myCharId = me?.character?.id;
    grid.innerHTML = '';
    for (const ch of CHARACTER_DATA) {
      const isTaken = takenCharIds.includes(ch.id);
      const isMine = ch.id === myCharId;
      const takenBy = isTaken && !isMine ? state.players.find(p => p.character?.id === ch.id) : null;
      const el = document.createElement('div');
      el.className = 'char-option' + (isMine ? ' selected' : '') + (isTaken && !isMine ? ' taken' : '');
      el.dataset.charId = ch.id;
      el.innerHTML = `
        <div class="char-portrait" style="--char-color:${ch.color}">${PORTRAITS[ch.id]}</div>
        <div class="char-name">${ch.name.split(' ')[0]}</div>
        ${takenBy ? `<div class="char-taken-label">${takenBy.name}</div>` : ''}
      `;
      if (!isTaken || isMine) {
        el.addEventListener('click', () => {
          if (isMine) return;
          SFX.click();
          socket.emit('changeCharacter', { characterId: ch.id });
        });
      }
      grid.appendChild(el);
    }
  }

  const isHost = state.players[0] && state.players[0].id === myId;
  $('#btn-start').style.display = (isHost && state.players.length >= 2) ? 'inline-block' : 'none';
  $('#btn-add-bot').style.display = (isHost && state.players.length < 8) ? 'inline-block' : 'none';
  $('#game-settings').style.display = isHost ? 'block' : 'none';
  $('#waiting-msg').textContent = state.players.length < 2 ? 'Потрібно мінімум 2 гравці...' : 'Готово до початку!';
}

// ===== GAME RENDER =====
function renderGame(state, skipPending = false) {
  // Hide roll-order overlay when game starts
  const roOverlay = document.getElementById('roll-order-overlay');
  if (roOverlay) roOverlay.style.display = 'none';

  // Restore game layout visibility
  const gameLayout = document.querySelector('.game-layout');
  if (gameLayout) gameLayout.style.visibility = '';

  // Reset center-panel from rolling_order phase if needed
  const centerPanel = document.querySelector('.center-panel');
  if (centerPanel) {
    centerPanel.style.display = '';
    centerPanel.style.justifyContent = '';
    centerPanel.style.alignItems = '';
    centerPanel.innerHTML = '';
  }
  // Restore board cell visibility
  const boardArea = document.querySelector('.board-area');
  if (boardArea) {
    boardArea.querySelectorAll('.board-cell').forEach(c => c.style.visibility = '');
  }
  renderBoard(state);
  renderPlayerPanels(state);
  renderTopBar(state);
  renderActionPanel(state);
  renderMafiaCards(state);
  renderMyBusinesses(state);
  renderLog(state);
  if (!skipPending) handlePendingAction(state);
}

// ===== BOARD (12 rows × 8 cols) =====
function getSide(row, col) {
  // 8 rows × 12 cols: top row 1, bottom row 8, left col 1, right col 12
  if (col === 1 && row > 1 && row < 8) return 'side-left';
  if (col === 12 && row > 1 && row < 8) return 'side-right';
  if (row === 1 && col > 1 && col < 12) return 'side-top';
  if (row === 8 && col > 1 && col < 12) return 'side-bottom';
  return '';
}

function getCornerSide(sectorIndex) {
  // Corners: START(0)=top-left, BAR(11)=top-right, POLICE(18)=bottom-right, PRISON(29)=bottom-left
  if (sectorIndex === 0) return 'corner-tl';
  if (sectorIndex === 11) return 'corner-tr';
  if (sectorIndex === 18) return 'corner-br';
  if (sectorIndex === 29) return 'corner-bl';
  return '';
}

function renderBoard(state) {
  const board = $('#game-board');
  board.innerHTML = '';

  const cellMap = {};
  const gridData = state.boardGrid || {};
  for (const sector of state.board) {
    const pos = gridData[sector.index];
    if (pos) cellMap[`${pos.row}-${pos.col}`] = sector;
  }

  // Track district groupings for headers
  const districtGroups = {};

  for (let row = 1; row <= 8; row++) {
    for (let col = 1; col <= 12; col++) {
      const cell = document.createElement('div');
      const key = `${row}-${col}`;
      const sector = cellMap[key];

      if (sector) {
        const side = getSide(row, col);
        const cornerClass = getCornerSide(sector.index);
        cell.className = `board-cell ${sector.type.toLowerCase()} ${side} ${cornerClass}`.trim();
        cell.dataset.index = sector.index;

        // Build cell content based on type and side
        renderCellInner(cell, sector, state, side);

        // Player tokens (support up to 8) — centered, arranged in circle if multiple
        const tokens = getPlayersOnSector(sector.index, state);
        const tokenCount = tokens.length;
        // Prison visual: mark cell as containing prisoners for CSS bars overlay
        if (sector.type === 'PRISON' && tokens.some(p => p.inPrison > 0)) {
          cell.classList.add('has-prisoners');
        }
        tokens.forEach((p, i) => {
          const token = document.createElement('div');
          token.className = 'player-token';
          if (state.currentPlayerId === p.id) token.classList.add('token-current');
          if (p.id === myId) token.classList.add('token-me');
          if (p.inPrison > 0) token.classList.add('token-prisoner');
          token.dataset.pid = p.id;
          const pColor = p.character ? p.character.color : '#888';
          const pName = p.name || '?';
          token.style.background = pColor;
          token.style.color = pColor;
          token.title = pName;
          token.textContent = pName[0];
          // Position: 1 token = center; 2+ = circle around center
          if (tokenCount === 1) {
            token.style.top = '50%';
            token.style.left = '50%';
            token.style.transform = 'translate(-50%, -50%)';
          } else {
            const radius = Math.min(tokenCount <= 4 ? 13 : 16, 18);
            const angle = (2 * Math.PI * i / tokenCount) - Math.PI / 2;
            const ox = Math.cos(angle) * radius;
            const oy = Math.sin(angle) * radius;
            token.style.top = '50%';
            token.style.left = '50%';
            token.style.transform = `translate(calc(-50% + ${ox.toFixed(1)}px), calc(-50% + ${oy.toFixed(1)}px))`;
          }
          // Hide real token if this player is being animated
          if (animatingPlayerId === p.id) token.style.display = 'none';
          cell.appendChild(token);
        });

        // Bombs
        if (state.bombs && state.bombs.some(b => b.sector === sector.index)) {
          cell.classList.add('has-bomb');
          const bomb = document.createElement('div');
          bomb.className = 'bomb-marker';
          bomb.innerHTML = `<svg viewBox="0 0 64 64" width="32" height="32">
            <circle cx="32" cy="38" r="20" fill="#1a1a1a" stroke="#ff4400" stroke-width="2"/>
            <circle cx="32" cy="38" r="16" fill="url(#bombGrad)"/>
            <rect x="29" y="12" width="6" height="12" rx="3" fill="#888"/>
            <circle cx="32" cy="8" r="5" fill="#ff6600" opacity="0.9">
              <animate attributeName="r" values="4;6;4" dur="0.8s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.7;1;0.7" dur="0.8s" repeatCount="indefinite"/>
            </circle>
            <circle cx="32" cy="8" r="3" fill="#ffcc00">
              <animate attributeName="r" values="2;4;2" dur="0.6s" repeatCount="indefinite"/>
            </circle>
            <defs><radialGradient id="bombGrad" cx="40%" cy="35%"><stop offset="0%" stop-color="#444"/><stop offset="100%" stop-color="#111"/></radialGradient></defs>
          </svg>`;
          cell.appendChild(bomb);
        }

        cell.addEventListener('click', () => onCellClick(sector));
      } else {
        cell.className = 'board-cell empty';
      }

      cell.style.gridRow = row;
      cell.style.gridColumn = col;
      board.appendChild(cell);
    }
  }
}

function renderCellInner(cell, sector, state, side) {
  if (sector.type === 'business') {
    const district = state.districts.find(d => d.id === sector.districtId);
    const biz = district.businesses[sector.businessIndex];
    const bizId = biz.id;
    const bizState = state.businesses[bizId];
    const isOwned = bizState && bizState.owner;
    const owner = isOwned ? state.players.find(p => p.id === bizState.owner) : null;

    // Set district color as CSS variable for cell effects
    cell.style.setProperty('--dist-color', district.color);
    if (owner?.character?.color) {
      cell.style.setProperty('--owner-color', owner.character.color);
    }

    // District color bar
    const distBar = document.createElement('div');
    distBar.className = 'district-bar';
    distBar.style.background = district.color;
    cell.appendChild(distBar);

    // Owner bar (opposite side)
    if (owner) {
      cell.classList.add('is-owned');
      if (owner.id === myId) cell.classList.add('owned-by-me');
      if (owner.id === state.currentPlayerId) cell.classList.add('owned-by-current');
      const ownerBar = document.createElement('div');
      ownerBar.className = 'owner-bar';
      ownerBar.style.background = owner.character.color;
      cell.appendChild(ownerBar);

      // Influence stars (per-business)
      const inf = bizState.influenceLevel || 0;
      if (inf > 0) {
        const stars = document.createElement('div');
        stars.className = 'influence-stars';
        stars.textContent = '★'.repeat(Math.min(inf, 4));
        cell.appendChild(stars);
      }
    } else {
      // Free indicator
      const freeInd = document.createElement('div');
      freeInd.className = 'free-indicator';
      cell.appendChild(freeInd);
    }

    // Content wrapper
    const content = document.createElement('div');
    content.className = 'cell-content';

    // Icon
    const iconDiv = document.createElement('div');
    iconDiv.className = 'cell-icon';
    iconDiv.innerHTML = BIZ_ICONS[bizId] || '';
    content.appendChild(iconDiv);

    // Name
    const nameDiv = document.createElement('div');
    nameDiv.className = 'cell-name';
    nameDiv.textContent = biz.name;
    if (district.color) nameDiv.style.color = district.color;
    content.appendChild(nameDiv);

    // Price
    const priceDiv = document.createElement('div');
    priceDiv.className = 'cell-price';
    priceDiv.textContent = biz.price + '$';
    content.appendChild(priceDiv);

    cell.appendChild(content);

  } else {
    // Special cells (START, BAR, POLICE, PRISON, MAFIA, EVENT)
    const typeKey = sector.type;
    const content = document.createElement('div');
    content.className = 'cell-content special-content';

    const iconDiv = document.createElement('div');
    iconDiv.className = 'cell-icon special-icon';
    iconDiv.innerHTML = SPECIAL_ICONS[typeKey] || '';
    content.appendChild(iconDiv);

    const nameDiv = document.createElement('div');
    nameDiv.className = 'cell-name';
    const colorMap = { START: 'var(--green-light)', POLICE: 'var(--blue-light)', PRISON: 'var(--red-light)', BAR: 'var(--gold)', MAFIA: 'var(--purple-light)', EVENT: '#6688bb' };
    nameDiv.style.color = colorMap[typeKey] || 'var(--text)';
    const nameMap = { START: 'START', POLICE: 'ПОЛІЦІЯ', PRISON: "В'ЯЗНИЦЯ", BAR: 'BAR', MAFIA: 'MAFIA', EVENT: 'ПОДІЯ' };
    nameDiv.textContent = nameMap[typeKey] || typeKey;
    content.appendChild(nameDiv);

    cell.appendChild(content);
  }
}

function getPlayersOnSector(sectorIndex, state) {
  return state.players.filter(p => p.alive && p.position === sectorIndex);
}

function getBizIdFromSector(sector, state) {
  const district = state.districts.find(d => d.id === sector.districtId);
  return district.businesses[sector.businessIndex].id;
}

function onCellClick(sector) {
  SFX.click();
  if (sector.type === 'business') {
    const district = gameState.districts.find(d => d.id === sector.districtId);
    const biz = district.businesses[sector.businessIndex];
    const bizState = gameState.businesses[biz.id];
    const ownerName = bizState.owner ? gameState.players.find(p => p.id === bizState.owner)?.name : 'Вільний';
    showEventDisplay(`
      <h3 style="color:${district.color}">${biz.name}</h3>
      <p>${district.name} | Ціна: ${biz.price}$</p>
      <p>Рента: ${biz.rent.join(' / ')}$</p>
      <p>Власник: ${ownerName}</p>
    `);
  } else {
    showEventDisplay(`<h3>${sector.name || sector.type}</h3>`);
  }
}

let eventDisplayTimer = null;
function showEventDisplay(html, duration = 0) {
  const display = $('#event-display');
  display.innerHTML = html;
  display.classList.add('visible');
  if (eventDisplayTimer) clearTimeout(eventDisplayTimer);
  eventDisplayTimer = null;
  // duration=0 means persist until next event; duration>0 means auto-hide (for errors/short msgs)
  if (duration > 0) {
    eventDisplayTimer = setTimeout(() => {
      display.classList.remove('visible');
      eventDisplayTimer = null;
    }, duration);
  }
}
function hideEventDisplay() {
  const display = $('#event-display');
  display.classList.remove('visible');
  if (eventDisplayTimer) { clearTimeout(eventDisplayTimer); eventDisplayTimer = null; }
}

// ===== CENTER INFO (dice, movement, events shown in board center) =====
function showCenterInfo(playerName, dice, total, oldPos, newPos, landingSector) {
  const info = $('#center-info');
  if (!info) return;

  // Build dice display
  const pipLayouts = { 1: [5], 2: [3,7], 3: [3,5,7], 4: [1,3,7,9], 5: [1,3,5,7,9], 6: [1,3,4,6,7,9] };
  let diceHtml = '<div class="ci-dice">';
  for (const d of dice) {
    diceHtml += '<div class="ci-die">';
    for (let i = 1; i <= 9; i++) {
      diceHtml += (pipLayouts[d] || []).includes(i) ? '<div class="ci-pip"></div>' : '<div></div>';
    }
    diceHtml += '</div>';
  }
  diceHtml += '</div>';

  // Landing sector name
  let landingName = '';
  if (landingSector) {
    if (landingSector.type === 'business') {
      const district = gameState?.districts?.find(d => d.id === landingSector.districtId);
      const biz = district?.businesses?.[landingSector.businessIndex];
      landingName = biz ? biz.name : 'Бізнес';
    } else {
      const nameMap = { START: 'START', POLICE: 'ПОЛІЦІЯ', PRISON: "В'ЯЗНИЦЯ", BAR: 'BAR', MAFIA: 'MAFIA', EVENT: 'ПОДІЯ' };
      landingName = nameMap[landingSector.type] || landingSector.type;
    }
  }

  info.innerHTML = `
    <div class="ci-title">${playerName}</div>
    ${diceHtml}
    <div class="ci-text">Кубики: ${dice.join(' + ')} = ${total}</div>
    ${landingName ? `<div class="ci-sub">→ ${landingName}</div>` : ''}
  `;
  info.style.display = 'block';

  // Auto-hide after 4 seconds
  clearTimeout(info._hideTimer);
  info._hideTimer = setTimeout(() => { info.style.display = 'none'; }, 4000);
}

// Show any event/action result in center info
function showCenterMessage(title, text, duration = 3000) {
  const info = $('#center-info');
  if (!info) return;
  info.innerHTML = `
    <div class="ci-title">${escapeHtml(title)}</div>
    <div class="ci-text">${formatUiText(text)}</div>
  `;
  info.style.display = 'block';
  clearTimeout(info._hideTimer);
  info._hideTimer = setTimeout(() => { info.style.display = 'none'; }, duration);
}

// ===== SMOOTH TOKEN ANIMATION =====
function getCellCenter(sectorIndex) {
  const cell = document.querySelector(`.board-cell[data-index="${sectorIndex}"]`);
  if (!cell) return null;
  const board = document.querySelector('.board-area');
  if (!board) return null;
  const cellRect = cell.getBoundingClientRect();
  const boardRect = board.getBoundingClientRect();
  return {
    x: cellRect.left - boardRect.left + cellRect.width / 2,
    y: cellRect.top - boardRect.top + cellRect.height / 2
  };
}

function animateTokenMovement(playerId, fromPos, toPos) {
  const player = gameState?.players?.find(p => p.id === playerId);
  if (!player) return;

  const board = document.querySelector('.board-area');
  if (!board) return;

  // Hide real tokens for this player during animation
  animatingPlayerId = playerId;
  document.querySelectorAll(`.player-token[data-pid="${playerId}"]`).forEach(t => t.style.display = 'none');

  // Create floating token
  const floater = document.createElement('div');
  floater.className = 'floating-token';
  floater.style.background = player.character ? player.character.color : '#888';
  floater.style.color = player.character ? player.character.color : '#888';
  floater.textContent = (player.name || '?')[0];
  board.appendChild(floater);

  // Calculate path (step by step around the board)
  const totalSectors = 36;
  const steps = [];
  let pos = fromPos;
  while (pos !== toPos) {
    pos = (pos + 1) % totalSectors;
    steps.push(pos);
  }

  // Start position
  const startCenter = getCellCenter(fromPos);
  if (startCenter) {
    floater.style.left = (startCenter.x - 11) + 'px';
    floater.style.top = (startCenter.y - 11) + 'px';
  }

  // Animate step by step
  const isOwnToken = playerId === myId;
  animatingTokens = true;
  let stepIdx = 0;
  function nextStep() {
    if (stepIdx >= steps.length) {
      // Done — remove floater, show real tokens
      floater.remove();
      animatingTokens = false;
      animatingPlayerId = null;
      document.querySelectorAll(`.player-token[data-pid="${playerId}"]`).forEach(t => t.style.display = '');
      return;
    }
    const center = getCellCenter(steps[stepIdx]);
    if (center) {
      floater.style.left = (center.x - 11) + 'px';
      floater.style.top = (center.y - 11) + 'px';
    }
    // Play tick sound for each step
    if (isOwnToken) SFX.tokenTick(); else SFX.tokenTickOther();
    stepIdx++;
    setTimeout(nextStep, 300);
  }
  // Start after a small delay
  setTimeout(nextStep, 100);
}

// ===== CENTER PANEL (replaces modal for basic game actions) =====
function showCenterPanel(title, description, buttons, extraHtml) {
  const panel = $('#center-panel');
  let html = '';
  if (title) html += `<h3>${title}</h3>`;
  if (description) html += `<p>${description}</p>`;
  if (extraHtml) html += extraHtml;
  html += '<div class="center-buttons">';
  // buttons rendered after innerHTML set
  panel.innerHTML = html + '</div>';
  const btnContainer = panel.querySelector('.center-buttons');
  for (const btn of buttons) {
    const el = document.createElement('button');
    el.className = `btn ${btn.cls || 'btn-primary'}`;
    el.innerHTML = btn.text;
    el.addEventListener('click', () => {
      if (el.disabled) return;
      el.disabled = true;
      el.style.opacity = '0.6';
      try { btn.action(); } catch(e) { console.error(e); }
      setTimeout(() => { el.disabled = false; el.style.opacity = ''; }, 1000);
    });
    btnContainer.appendChild(el);
  }
  panel.classList.add('active');
}

function hideCenterPanel() {
  const panel = $('#center-panel');
  if (panel) {
    panel.classList.remove('active');
    panel.style.display = '';
    panel.innerHTML = '';
  }
}

// ===== JACKPOT CHOOSE BUSINESS OVERLAY =====
function showJackpotChooseOverlay(state) {
  const overlay = document.createElement('div');
  overlay.className = 'jackpot-overlay active';
  overlay.innerHTML = `
    <div class="jackpot-particles" id="jp-particles"></div>
    <div class="jackpot-content">
      <div class="jackpot-crown">${ICON.crown}</div>
      <div class="jackpot-title">MAFIA JACKPOT</div>
      <div class="jackpot-subtitle">Оберіть будь-який бізнес — він ваш!</div>
      <div class="jackpot-grid" id="jackpot-grid"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Spawn particles
  const particlesEl = overlay.querySelector('#jp-particles');
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.className = 'jp-particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDelay = Math.random() * 3 + 's';
    p.style.animationDuration = (2 + Math.random() * 3) + 's';
    particlesEl.appendChild(p);
  }

  const grid = overlay.querySelector('#jackpot-grid');
  for (const district of (state.districts || [])) {
    for (const biz of district.businesses) {
      const bizState = state.businesses[biz.id];
      if (!bizState) continue;
      const ownerPlayer = bizState.owner ? state.players.find(p => p.id === bizState.owner) : null;
      const card = document.createElement('div');
      card.className = 'jackpot-biz-card';
      card.style.borderColor = district.color;
      card.innerHTML = `
        <div class="jbc-district" style="color:${district.color}">${district.name}</div>
        <div class="jbc-name">${biz.name}</div>
        <div class="jbc-price">${biz.price}$</div>
        ${ownerPlayer ? `<div class="jbc-owner">${ownerPlayer.name}</div>` : '<div class="jbc-free">Вільний</div>'}
      `;
      card.addEventListener('click', () => {
        SFX.buy();
        socket.emit('resolveAction', { actionType: 'jackpot_choose_business', data: { businessId: biz.id } }, handleResult);
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 500);
      });
      grid.appendChild(card);
    }
  }
}

// ===== BUSINESS PURCHASE CARD =====
function showBusinessCard(action) {
  const panel = $('#center-panel');
  const rentStr = action.rent ? action.rent.join(' / ') + '$' : '';
  const color = action.districtColor || 'var(--gold)';
  panel.innerHTML = `
    <div class="biz-purchase-card" style="--bpc-color:${color}">
      <div class="bpc-district" style="color:${color}">${action.districtName || ''}</div>
      <div class="bpc-dot" style="background:${color};box-shadow:0 0 12px ${color}"></div>
      <div class="bpc-name">${action.name}</div>
      <div class="bpc-divider"></div>
      <div class="bpc-details">
        <div class="bpc-row"><span>Вартість</span><span class="bpc-val">${action.price}$</span></div>
        ${rentStr ? `<div class="bpc-row"><span>Рента</span><span class="bpc-val">${rentStr}</span></div>` : ''}
        ${action.influenceCost ? `<div class="bpc-row"><span>Вплив</span><span class="bpc-val">${action.influenceCost}$</span></div>` : ''}
      </div>
      <div class="center-buttons">
        <button class="btn btn-primary" id="bpc-buy">Купити (${action.price}$)</button>
        <button class="btn btn-secondary" id="bpc-auction">Аукціон</button>
      </div>
    </div>
  `;
  panel.classList.add('active');
  panel.querySelector('#bpc-buy').addEventListener('click', () => {
    SFX.kaChing();
    socket.emit('resolveAction', { actionType: 'buy_business', data: { businessId: action.businessId, buy: true } }, handleResult);
    hideCenterPanel();
  });
  panel.querySelector('#bpc-auction').addEventListener('click', () => {
    socket.emit('resolveAction', { actionType: 'buy_business', data: { businessId: action.businessId, buy: false } }, handleResult);
    hideCenterPanel();
  });
}

// ===== CARD REVEAL ANIMATION =====
function showCardReveal(type, title, name, description, onDismiss) {
  // If card reveal is already showing, don't overwrite it
  if (cardRevealActive) return;
  hideCenterPanel();
  SFX.cardFlip();
  SFX.cardReveal();
  cardRevealActive = true;
  // Safety timeout: if the user never dismisses (stuck modal, animation glitch),
  // force-clear the flag after 30s so pending actions can proceed.
  if (_cardRevealTimeout) clearTimeout(_cardRevealTimeout);
  _cardRevealTimeout = setTimeout(() => {
    cardRevealActive = false;
    if (gameState && gameState.pendingAction) handlePendingAction(gameState);
  }, 30000);
  const reveal = $('#card-reveal');
  const typeClass = type === 'mafia' ? 'mafia-type' : 'event-type';
  const typeLabel = type === 'mafia' ? 'КАРТА MAFIA' : 'ПОДІЯ';

  const typeIcon = type === 'mafia' ? '&#9760;' : '&#9733;';
  reveal.innerHTML = `
    <div class="revealed-card ${typeClass}">
      <div class="rc-icon">${typeIcon}</div>
      <div class="rc-title">${typeLabel}</div>
      <div class="rc-divider"></div>
      <div class="rc-name">${name}</div>
      <div class="rc-desc">${description}</div>
      <button class="btn btn-primary" id="card-dismiss-btn">OK</button>
    </div>
  `;
  reveal.classList.add('active');
  // Hide clutter while card is shown
  const boardCenter = $('.board-center');
  if (boardCenter) boardCenter.classList.add('card-showing');

  function dismiss() {
    if (!reveal.classList.contains('active')) return;
    reveal.classList.remove('active');
    if (boardCenter) boardCenter.classList.remove('card-showing');
    cardRevealActive = false;
    if (_cardRevealTimeout) { clearTimeout(_cardRevealTimeout); _cardRevealTimeout = null; }
    if (onDismiss) onDismiss();
    // After card dismissed, process any deferred pending action
    if (gameState && gameState.pendingAction) {
      handlePendingAction(gameState);
    }
  }

  const dismissBtn = reveal.querySelector('#card-dismiss-btn');
  dismissBtn.addEventListener('click', dismiss);
}

// ===== HIDDEN HELPER CARD SELECTION =====
function showHiddenHelperChoice(cardCount) {
  hideCenterPanel();
  const overlay = document.createElement('div');
  overlay.className = 'hidden-helper-overlay active';
  overlay.innerHTML = `
    <div class="hh-backdrop"></div>
    <div class="hh-content">
      <div class="hh-title">НАЙНЯТИ ПОМІЧНИКА</div>
      <div class="hh-subtitle">Оберіть одну карту наосліп</div>
      <div class="hh-cards" id="hh-cards"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const cardsContainer = overlay.querySelector('#hh-cards');
  for (let i = 0; i < cardCount; i++) {
    const card = document.createElement('div');
    card.className = 'hh-card';
    card.dataset.index = i;
    card.innerHTML = `
      <div class="hh-card-inner">
        <div class="hh-card-back">
          <div class="hh-card-back-icon">?</div>
          <div class="hh-card-back-label">Помічник</div>
        </div>
        <div class="hh-card-front">
          <div class="hh-card-front-icon">&#9733;</div>
          <div class="hh-card-front-name"></div>
          <div class="hh-card-front-desc"></div>
        </div>
      </div>
    `;
    // Stagger entrance animation
    card.style.animationDelay = (i * 0.15) + 's';
    card.addEventListener('click', () => {
      if (card.classList.contains('hh-chosen') || card.classList.contains('hh-rejected')) return;
      SFX.cardFlip();
      cardRevealActive = true; // Block other pending actions during flip
      // Disable all cards
      cardsContainer.querySelectorAll('.hh-card').forEach(c => {
        if (c !== card) c.classList.add('hh-rejected');
      });
      card.classList.add('hh-chosen');
      // Send choice to server and get the hired helper back
      socket.emit('resolveAction', { actionType: 'choose_hidden_helper', data: { cardIndex: i } }, (res) => {
        if (res && res.error) {
          cardRevealActive = false;
          handleResult(res);
          overlay.classList.remove('active');
          setTimeout(() => overlay.remove(), 400);
          return;
        }
        // Reveal the chosen card with flip animation
        if (res && res.hired) {
          const iconEl = card.querySelector('.hh-card-front-icon');
          const front = card.querySelector('.hh-card-front-name');
          const desc = card.querySelector('.hh-card-front-desc');
          // Show SVG portrait if available
          if (res.hired.id && HELPER_PORTRAITS[res.hired.id]) {
            iconEl.innerHTML = HELPER_PORTRAITS[res.hired.id];
            iconEl.classList.add('hh-has-portrait');
          }
          front.textContent = res.hired.name;
          desc.textContent = res.hired.description || '';
          card.classList.add('hh-flipped');
          SFX.helperReveal();
          // After flip animation, show full card reveal then close overlay
          setTimeout(() => {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 400);
            cardRevealActive = false; // Reset so showCardReveal can activate
            showCardReveal('event', 'НОВИЙ ПОМІЧНИК', res.hired.name, res.hired.description || '', null);
          }, 1200);
        } else {
          cardRevealActive = false;
          overlay.classList.remove('active');
          setTimeout(() => overlay.remove(), 400);
        }
      });
    });
    cardsContainer.appendChild(card);
  }
}

// ===== DOUBLE AGENT: blind pick of a helper to steal =====
// Step 1 of swap: pick which of your own helpers to give up (names visible)
function showChooseOwnHelperToRelease(ownHelpers, targetName) {
  hideCenterPanel();
  const overlay = document.createElement('div');
  overlay.className = 'hidden-helper-overlay active';
  overlay.innerHTML = `
    <div class="hh-backdrop"></div>
    <div class="hh-content">
      <div class="hh-title" style="color:#b59c4e">ОБМІН ПОМІЧНИКАМИ</div>
      <div class="hh-subtitle">У вас максимум помічників. Оберіть кого віддати, щоб забрати помічника ${targetName}</div>
      <div class="hh-cards" id="own-helper-cards"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const cardsContainer = overlay.querySelector('#own-helper-cards');
  ownHelpers.forEach((h, i) => {
    const card = document.createElement('div');
    card.className = 'hh-card hh-flipped'; // start flipped (face up — names visible)
    card.dataset.index = i;
    const hasPortrait = h.id && HELPER_PORTRAITS[h.id];
    card.innerHTML = `
      <div class="hh-card-inner">
        <div class="hh-card-back"></div>
        <div class="hh-card-front" style="border-color:rgba(181,156,78,0.6)">
          <div class="hh-card-front-icon ${hasPortrait ? 'hh-has-portrait' : ''}">${hasPortrait ? HELPER_PORTRAITS[h.id] : '&#9733;'}</div>
          <div class="hh-card-front-name">${h.name}</div>
        </div>
      </div>
    `;
    card.style.animationDelay = (i * 0.1) + 's';
    card.addEventListener('click', () => {
      if (card.classList.contains('hh-chosen') || card.classList.contains('hh-rejected')) return;
      SFX.cardFlip();
      cardsContainer.querySelectorAll('.hh-card').forEach(c => {
        if (c !== card) c.classList.add('hh-rejected');
      });
      card.classList.add('hh-chosen');
      socket.emit('resolveAction', { actionType: 'choose_own_helper_to_release', data: { helperIndex: i } }, (res) => {
        if (res && res.error) {
          handleResult(res);
        }
        setTimeout(() => {
          overlay.classList.remove('active');
          setTimeout(() => overlay.remove(), 400);
        }, 600);
      });
    });
    cardsContainer.appendChild(card);
  });
}

function showStolenHelperChoice(helperCount, isSwap, targetName, releasedHelperName) {
  hideCenterPanel();
  const overlay = document.createElement('div');
  overlay.className = 'hidden-helper-overlay active';
  const swapHint = isSwap && releasedHelperName
    ? `Ви віддаєте <strong style="color:#e74c3c">${releasedHelperName}</strong>. `
    : '';
  overlay.innerHTML = `
    <div class="hh-backdrop"></div>
    <div class="hh-content">
      <div class="hh-title" style="color:#b59c4e">ПОДВІЙНИЙ АГЕНТ</div>
      <div class="hh-subtitle">${swapHint}Оберіть помічника ${targetName || 'цілі'} наосліп</div>
      <div class="hh-cards" id="sh-cards"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const cardsContainer = overlay.querySelector('#sh-cards');
  for (let i = 0; i < helperCount; i++) {
    const card = document.createElement('div');
    card.className = 'hh-card';
    card.dataset.index = i;
    card.innerHTML = `
      <div class="hh-card-inner">
        <div class="hh-card-back">
          <div class="hh-card-back-icon">?</div>
          <div class="hh-card-back-label">Агент</div>
        </div>
        <div class="hh-card-front">
          <div class="hh-card-front-icon">&#9733;</div>
          <div class="hh-card-front-name"></div>
          <div class="hh-card-front-desc"></div>
        </div>
      </div>
    `;
    card.style.animationDelay = (i * 0.15) + 's';
    card.addEventListener('click', () => {
      if (card.classList.contains('hh-chosen') || card.classList.contains('hh-rejected')) return;
      SFX.cardFlip();
      cardRevealActive = true;
      cardsContainer.querySelectorAll('.hh-card').forEach(c => {
        if (c !== card) c.classList.add('hh-rejected');
      });
      card.classList.add('hh-chosen');
      socket.emit('resolveAction', { actionType: 'choose_stolen_helper', data: { helperIndex: i } }, (res) => {
        if (res && res.error) {
          cardRevealActive = false;
          handleResult(res);
          overlay.classList.remove('active');
          setTimeout(() => overlay.remove(), 400);
          return;
        }
        const helperName = res && (res.helper || res.stolen);
        const helperId = res && res.helperId;
        if (helperName) {
          const iconEl = card.querySelector('.hh-card-front-icon');
          const front = card.querySelector('.hh-card-front-name');
          const desc = card.querySelector('.hh-card-front-desc');
          if (helperId && HELPER_PORTRAITS[helperId]) {
            iconEl.innerHTML = HELPER_PORTRAITS[helperId];
            iconEl.classList.add('hh-has-portrait');
          }
          front.textContent = helperName;
          desc.textContent = res.released ? `Ви відпустили: ${res.released}` : 'Перейшов до вас';
          card.classList.add('hh-flipped');
          SFX.helperReveal();
          setTimeout(() => {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 400);
            cardRevealActive = false;
            showCardReveal('event', 'ПЕРЕМАНЕНО АГЕНТА', helperName,
              res.released ? `В обмін на ${res.released}` : 'Агент працює на вас', null);
          }, 1200);
        } else {
          cardRevealActive = false;
          overlay.classList.remove('active');
          setTimeout(() => overlay.remove(), 400);
        }
      });
    });
    cardsContainer.appendChild(card);
  }
}

// ===== KILL HELPER CARD SELECTION (BAR-style flip) =====
function showKillHelperChoice(targetName, helpers, onChoose) {
  hideCenterPanel();
  const overlay = document.createElement('div');
  overlay.className = 'hidden-helper-overlay active kill-helper-overlay';
  overlay.innerHTML = `
    <div class="hh-backdrop"></div>
    <div class="hh-content">
      <div class="hh-title" style="color:#e74c3c">ЗАМАХ</div>
      <div class="hh-subtitle">Оберіть помічника ${targetName}, який загине</div>
      <div class="hh-cards" id="kh-cards"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const cardsContainer = overlay.querySelector('#kh-cards');
  helpers.forEach((h, i) => {
    const card = document.createElement('div');
    card.className = 'hh-card';
    card.dataset.index = i;
    const hasPortrait = h.id && HELPER_PORTRAITS[h.id];
    card.innerHTML = `
      <div class="hh-card-inner">
        <div class="hh-card-back" style="border-color:rgba(231,76,60,0.4)">
          <div class="hh-card-back-icon">${ICON.skull}</div>
          <div class="hh-card-back-label">Помічник</div>
        </div>
        <div class="hh-card-front" style="border-color:rgba(231,76,60,0.6)">
          <div class="hh-card-front-icon ${hasPortrait ? 'hh-has-portrait' : ''}">${hasPortrait ? HELPER_PORTRAITS[h.id] : '&#9733;'}</div>
          <div class="hh-card-front-name">${h.name}</div>
        </div>
      </div>
    `;
    card.style.animationDelay = (i * 0.15) + 's';
    card.addEventListener('click', () => {
      if (card.classList.contains('hh-chosen') || card.classList.contains('hh-rejected')) return;
      SFX.cardFlip();
      // Flip all cards to reveal
      cardsContainer.querySelectorAll('.hh-card').forEach(c => {
        c.classList.add('hh-flipped');
        if (c !== card) c.classList.add('hh-rejected');
      });
      card.classList.add('hh-chosen');
      // After flip, close overlay and execute choice
      setTimeout(() => {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 400);
        onChoose(i);
      }, 1200);
    });
    cardsContainer.appendChild(card);
  });
}

// ===== BOMB SECTOR PICKER =====
function showBombSectorPicker() {
  const state = gameState;
  if (!state) return;
  const me = state.players.find(p => p.id === myId);
  if (!me) return;

  const overlay = document.createElement('div');
  overlay.className = 'bomb-picker-overlay active';
  overlay.innerHTML = `
    <div class="bomb-picker-backdrop"></div>
    <div class="bomb-picker-content">
      <div class="bomb-picker-title">${ICON.bomb} ВСТАНОВИТИ БОМБУ</div>
      <div class="bomb-picker-subtitle">Оберіть сектор, на якому встановити бомбу</div>
      <div class="bomb-picker-grid" id="bomb-picker-grid"></div>
      <button class="btn btn-secondary" id="bomb-picker-cancel">Скасувати</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const grid = overlay.querySelector('#bomb-picker-grid');
  const board = state.board || [];
  const businessById = state.businesses || {};

  for (const sector of board) {
    const i = sector.index;
    const cell = document.createElement('button');
    cell.className = 'bomb-picker-cell';
    let label = `${i}`;
    if (['START', 'BAR', 'POLICE', 'PRISON'].includes(sector.type)) {
      label = sector.name;
      cell.classList.add('bps-special');
    } else if (sector.type === 'MAFIA') {
      label = `${i}\nMAFIA`;
      cell.classList.add('bps-mafia');
    } else if (sector.type === 'EVENT') {
      label = `${i}\nПОДІЯ`;
      cell.classList.add('bps-event');
    } else if (sector.type === 'business') {
      const district = (state.districts || []).find(d => d.id === sector.districtId);
      const biz = district && district.businesses ? district.businesses[sector.businessIndex] : null;
      const bizName = biz ? biz.name : `Бізнес ${i}`;
      label = `${i}\n${bizName}`;
    }
    if (i === me.position) cell.classList.add('bps-me');
    cell.innerText = label;
    cell.addEventListener('click', () => {
      SFX.attack();
      socket.emit('playMafiaCard', { cardId: 'bomb', options: { sector: i } }, (res) => {
        handleResult(res);
        overlay.remove();
      });
    });
    grid.appendChild(cell);
  }
  overlay.querySelector('#bomb-picker-cancel').addEventListener('click', () => overlay.remove());
}

// ===== BOMB EXPLOSION ANIMATION =====
function showExplosion(playerName) {
  const overlay = document.createElement('div');
  overlay.className = 'explosion-overlay';

  // Flash
  const flash = document.createElement('div');
  flash.className = 'explosion-flash';
  overlay.appendChild(flash);

  // Expanding ring
  const ring = document.createElement('div');
  ring.className = 'explosion-ring';
  overlay.appendChild(ring);

  // Particles
  const colors = ['#ff4400', '#ff8800', '#ffcc00', '#ff2200', '#ffaa33', '#fff'];
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'explosion-particle';
    const angle = (Math.PI * 2 * i) / 30;
    const dist = 100 + Math.random() * 250;
    p.style.setProperty('--px', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--py', `${Math.sin(angle) * dist}px`);
    p.style.left = '50%';
    p.style.top = '50%';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.width = (4 + Math.random() * 6) + 'px';
    p.style.height = p.style.width;
    p.style.animationDelay = (Math.random() * 0.3) + 's';
    overlay.appendChild(p);
  }

  // Text
  const text = document.createElement('div');
  text.className = 'explosion-text';
  text.innerHTML = `<h1>${ICON.bomb} ВИБУХ!</h1><p>${playerName} підірвався на бомбі!</p>`;
  overlay.appendChild(text);

  document.body.appendChild(overlay);
  SFX.attack();
  setTimeout(() => overlay.remove(), 3500);
}

// ===== PLAYER KILL/ELIMINATION ANIMATION =====
function showKillAnimation(playerName, reason) {
  const overlay = document.createElement('div');
  overlay.className = 'kill-overlay';

  const drip = document.createElement('div');
  drip.className = 'kill-blood-drip';
  overlay.appendChild(drip);

  const content = document.createElement('div');
  content.className = 'kill-content';
  content.innerHTML = `
    <div class="kill-skull">☠</div>
    <div class="kill-title">Ліквідовано</div>
    <div class="kill-name">${playerName}</div>
    <div class="kill-reason">${reason || 'Вибув з гри'}</div>
  `;
  overlay.appendChild(content);

  document.body.appendChild(overlay);
  SFX.attack();
  setTimeout(() => overlay.remove(), 4500);
}

// ===== PRISON EFFECT =====
function showPrisonEffect(playerName, turns) {
  const overlay = document.createElement('div');
  overlay.className = 'prison-effect-overlay';

  // Dark bars descending
  const bars = document.createElement('div');
  bars.className = 'prison-bars';
  for (let i = 0; i < 7; i++) {
    const bar = document.createElement('div');
    bar.className = 'prison-bar';
    bar.style.left = (8 + i * 14) + '%';
    bar.style.animationDelay = (i * 0.06) + 's';
    bars.appendChild(bar);
  }
  overlay.appendChild(bars);

  // Flash
  const flash = document.createElement('div');
  flash.className = 'prison-flash';
  overlay.appendChild(flash);

  // Content
  const content = document.createElement('div');
  content.className = 'prison-effect-content';
  content.innerHTML = `
    <div class="prison-effect-icon"><svg viewBox="0 0 64 64" fill="none" stroke="#ff4444" stroke-width="2"><rect x="10" y="8" width="44" height="48" rx="4" stroke-width="2.5"/><line x1="20" y1="8" x2="20" y2="56"/><line x1="32" y1="8" x2="32" y2="56"/><line x1="44" y1="8" x2="44" y2="56"/><rect x="22" y="28" width="20" height="12" rx="3" fill="rgba(255,68,68,0.15)" stroke-width="2"/><circle cx="30" cy="34" r="3"/><path d="M33 34h6" stroke-linecap="round"/></svg></div>
    <div class="prison-effect-title">ЗА ҐРАТИ!</div>
    <div class="prison-effect-name">${playerName}</div>
    <div class="prison-effect-turns">${turns} ${turns === 1 ? 'хід' : 'ходи'} за ґратами</div>
  `;
  overlay.appendChild(content);

  // Chain/lock particles — SVG icons instead of emoji
  const particleIcons = [ICON.chain, ICON.lock, ICON.chain, ICON.lock, ICON.chain];
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('div');
    p.className = 'prison-chain-particle';
    const angle = (Math.PI * 2 * i) / 12;
    const dist = 100 + Math.random() * 180;
    p.style.setProperty('--px', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--py', `${Math.sin(angle) * dist}px`);
    p.style.left = '50%';
    p.style.top = '50%';
    p.innerHTML = particleIcons[i % particleIcons.length];
    p.style.animationDelay = (Math.random() * 0.3) + 's';
    overlay.appendChild(p);
  }

  document.body.appendChild(overlay);
  SFX.prisonDoor();
  setTimeout(() => overlay.remove(), 4000);
}

// ===== ATTACK OUTCOME EFFECT =====
function showAttackEffect(type, title, subtitle, color) {
  const overlay = document.createElement('div');
  overlay.className = 'attack-effect-overlay';
  overlay.style.setProperty('--effect-color', color);

  // Background flash
  const flash = document.createElement('div');
  flash.className = 'attack-effect-flash';
  overlay.appendChild(flash);

  // Icon
  const iconMap = {
    shield: '🛡️', police: '🚔', money: '💰', hero: '💀➜🛡️',
    fail: '💨', ghost: '👻', skull: '💀'
  };
  const iconEl = document.createElement('div');
  iconEl.className = 'attack-effect-icon';
  iconEl.textContent = iconMap[type] || '⚡';
  overlay.appendChild(iconEl);

  // Title
  const titleEl = document.createElement('div');
  titleEl.className = 'attack-effect-title';
  titleEl.textContent = title;
  overlay.appendChild(titleEl);

  // Subtitle
  const subEl = document.createElement('div');
  subEl.className = 'attack-effect-subtitle';
  subEl.textContent = subtitle;
  overlay.appendChild(subEl);

  // Particles
  const particleColors = [color, '#fff', color + '99'];
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'attack-effect-particle';
    const angle = (Math.PI * 2 * i) / 20;
    const dist = 80 + Math.random() * 200;
    p.style.setProperty('--px', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--py', `${Math.sin(angle) * dist}px`);
    p.style.left = '50%';
    p.style.top = '50%';
    p.style.background = particleColors[Math.floor(Math.random() * particleColors.length)];
    p.style.width = (3 + Math.random() * 5) + 'px';
    p.style.height = p.style.width;
    p.style.animationDelay = (Math.random() * 0.4) + 's';
    overlay.appendChild(p);
  }

  // Shockwave ring
  const ring = document.createElement('div');
  ring.className = 'attack-effect-ring';
  overlay.appendChild(ring);

  document.body.appendChild(overlay);

  // Sound
  if (type === 'shield' || type === 'hero') SFX.click();
  else if (type === 'police') SFX.prisonDoor();
  else if (type === 'money') SFX.payRent();
  else SFX.attack();

  setTimeout(() => overlay.remove(), 3500);
}

// ===== CARD DRAWN EFFECT (for other players) =====
let _cdeProtectedUntil = 0; // timestamp: don't remove overlay before this
function showCardDrawnEffect(data) {
  const now = Date.now();
  const existing = document.querySelector('.card-drawn-overlay');
  // Only remove existing overlay if its minimum display time has passed
  if (existing) {
    if (now < _cdeProtectedUntil) return; // still showing, don't interrupt
    existing.remove();
  }

  const isMafia = data.type === 'mafia';
  const displayTime = isMafia ? 4500 : 5000; // minimum display time in ms
  _cdeProtectedUntil = now + displayTime;

  const portrait = data.playerCharacter?.id && PORTRAITS[data.playerCharacter.id]
    ? PORTRAITS[data.playerCharacter.id] : '';
  const avatarColor = data.playerCharacter?.color || '#888';

  // For mafia: show face-down card(s) flying to player
  // For event: show open card with name/description
  let cardContent = '';
  if (isMafia) {
    let cardsHtml = '';
    for (let i = 0; i < (data.cardCount || 1); i++) {
      cardsHtml += `<div class="cde-card cde-card-mafia" style="animation-delay:${i * 0.15}s">
        <div class="cde-card-back">
          <div class="cde-card-back-pattern">${ICON.mask}</div>
          <div class="cde-card-back-label">MAFIA</div>
        </div>
      </div>`;
    }
    cardContent = `
      <div class="cde-cards">${cardsHtml}</div>
      <div class="cde-text">${data.playerName} отримав ${data.cardCount} карту MAFIA</div>
    `;
  } else {
    cardContent = `
      <div class="cde-card cde-card-event">
        <div class="cde-card-front">
          <div class="cde-card-icon">${ICON.explosion}</div>
          <div class="cde-card-type">ПОДІЯ</div>
          <div class="cde-card-name">${data.cardName || ''}</div>
          <div class="cde-card-desc">${data.cardDescription || ''}</div>
        </div>
      </div>
      <div class="cde-text">${data.playerName}: ${data.cardName}</div>
    `;
  }

  const overlay = document.createElement('div');
  overlay.className = 'card-drawn-overlay';
  overlay.innerHTML = `
    <div class="cde-container ${isMafia ? 'cde-mafia' : 'cde-event'}">
      <div class="cde-player">
        <div class="cde-avatar" style="--char-color:${avatarColor}">${portrait || data.playerName[0]}</div>
      </div>
      ${cardContent}
    </div>
  `;
  document.body.appendChild(overlay);
  SFX.cardFlip();

  // For mafia cards: trigger fly-away animation after 3.5s (separate from entrance)
  if (isMafia) {
    setTimeout(() => {
      overlay.querySelectorAll('.cde-card').forEach(c => c.classList.add('cde-fly'));
    }, 3500);
  }

  setTimeout(() => {
    overlay.classList.add('cde-fade-out');
    setTimeout(() => { overlay.remove(); _cdeProtectedUntil = 0; }, 500);
  }, displayTime);
}

// ===== RENT PAYMENT EFFECT =====
function showRentPaymentEffect(payerName, payerChar, ownerName, ownerChar, amount, businessName) {
  const overlay = document.createElement('div');
  overlay.className = 'rent-effect-overlay';

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'rent-effect-backdrop';
  overlay.appendChild(backdrop);

  // Container
  const container = document.createElement('div');
  container.className = 'rent-effect-container';

  // Payer avatar (left)
  const payerSide = document.createElement('div');
  payerSide.className = 'rent-effect-player rent-payer';
  const payerColor = payerChar?.color || '#e74c3c';
  const payerPortrait = payerChar?.id && PORTRAITS[payerChar.id] ? PORTRAITS[payerChar.id] : `<span style="font-size:32px;color:${payerColor}">${payerName[0]}</span>`;
  payerSide.innerHTML = `
    <div class="rent-avatar" style="--char-color:${payerColor}">${payerPortrait}</div>
    <div class="rent-player-name" style="color:${payerColor}">${payerName}</div>
    <div class="rent-player-label">Платить</div>
  `;

  // Center — money transfer
  const center = document.createElement('div');
  center.className = 'rent-effect-center';
  center.innerHTML = `
    <div class="rent-business-name">${businessName}</div>
    <div class="rent-arrow-track">
      <div class="rent-money-coin rent-coin-1">$</div>
      <div class="rent-money-coin rent-coin-2">$</div>
      <div class="rent-money-coin rent-coin-3">$</div>
      <div class="rent-arrow">→</div>
    </div>
    <div class="rent-amount">-${amount}$</div>
  `;

  // Owner avatar (right)
  const ownerSide = document.createElement('div');
  ownerSide.className = 'rent-effect-player rent-owner';
  const ownerColor = ownerChar?.color || '#2ecc71';
  const ownerPortrait = ownerChar?.id && PORTRAITS[ownerChar.id] ? PORTRAITS[ownerChar.id] : `<span style="font-size:32px;color:${ownerColor}">${ownerName[0]}</span>`;
  ownerSide.innerHTML = `
    <div class="rent-avatar" style="--char-color:${ownerColor}">${ownerPortrait}</div>
    <div class="rent-player-name" style="color:${ownerColor}">${ownerName}</div>
    <div class="rent-player-label">Отримує</div>
  `;

  container.appendChild(payerSide);
  container.appendChild(center);
  container.appendChild(ownerSide);
  overlay.appendChild(container);

  // Money particles flying from left to right
  for (let i = 0; i < 14; i++) {
    const p = document.createElement('div');
    p.className = 'rent-particle';
    p.textContent = '$';
    const yOffset = (Math.random() - 0.5) * 120;
    p.style.setProperty('--y-offset', `${yOffset}px`);
    p.style.animationDelay = (0.3 + Math.random() * 1.2) + 's';
    p.style.top = `calc(50% + ${(Math.random() - 0.5) * 40}px)`;
    p.style.fontSize = (12 + Math.random() * 10) + 'px';
    p.style.opacity = (0.3 + Math.random() * 0.5);
    overlay.appendChild(p);
  }

  document.body.appendChild(overlay);
  SFX.payRent();

  setTimeout(() => {
    overlay.classList.add('rent-fade-out');
    setTimeout(() => overlay.remove(), 600);
  }, 3800);
}

// ===== VICTORY SCREEN =====
function showVictoryScreen(state) {
  if (state.phase !== 'finished') return;

  // Find winner: try state.winner, then last alive, then richest
  let winner = null;
  if (state.winner) {
    winner = state.players.find(p => p.id === state.winner);
  }
  if (!winner) {
    const alive = state.players.filter(p => p.alive);
    if (alive.length === 1) {
      winner = alive[0];
    } else if (alive.length > 0) {
      winner = alive.reduce((a, b) => (a.money > b.money ? a : b));
    } else {
      winner = state.players.reduce((a, b) => (a.money > b.money ? a : b));
    }
  }
  if (!winner) return;

  SFX.epicVictory();
  const overlay = $('#victory-overlay');
  $('#victory-name').textContent = winner.name;
  $('#victory-stats').innerHTML = `
    <div class="stat-row"><span class="stat-label">Гроші</span><span class="stat-value">${winner.money}$</span></div>
    <div class="stat-row"><span class="stat-label">Бізнеси</span><span class="stat-value">${winner.businessCount || 0}</span></div>
    <div class="stat-row"><span class="stat-label">Повага</span><span class="stat-value">${winner.respectName || '???'} (Lv.${winner.respectLevel || 1})</span></div>
    <div class="stat-row"><span class="stat-label">Помічники</span><span class="stat-value">${winner.helpers ? winner.helpers.length : (winner.helperCount || 0)}</span></div>
  `;

  // Spawn confetti particles
  const particlesContainer = $('#victory-particles');
  if (particlesContainer) {
    particlesContainer.innerHTML = '';
    const colors = ['#c9a84c', '#e8c95a', '#f0d060', '#fff', '#8a6d1b', '#e74c3c', '#3498db', '#2ecc71'];
    for (let i = 0; i < 60; i++) {
      const p = document.createElement('div');
      p.className = 'victory-particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.animationDuration = (3 + Math.random() * 4) + 's';
      p.style.animationDelay = (Math.random() * 5) + 's';
      particlesContainer.appendChild(p);
    }
  }

  overlay.classList.add('active');
}

// ===== PLAYER PANELS =====
function renderPlayerPanels(state) {
  const container = $('#player-panels');
  container.innerHTML = '';
  for (const p of state.players) {
    const panel = document.createElement('div');
    const isCurrent = state.currentPlayerId === p.id;
    panel.className = `player-panel ${isCurrent ? 'current-turn' : ''} ${!p.alive ? 'dead' : ''} ${p.inPrison > 0 ? 'in-prison' : ''}`;

    const helperTags = p.helpers
      ? p.helpers.map(h => {
          const icon = HELPER_PORTRAITS[h.id] || '';
          const passiveTag = h.passive !== undefined ? `<span class="hc-badge ${h.passive ? 'passive' : 'active'}">${h.passive ? 'пасив' : 'актив'}</span>` : '';
          return `<div class="helper-card">${icon ? `<div class="hc-icon">${icon}</div>` : ''}<div class="hc-text"><div class="hc-name">${h.name}</div><div class="hc-desc">${h.description}</div></div>${passiveTag}</div>`;
        }).join('')
      : (p.helperCount > 0 ? `<div class="helper-card"><div class="hc-icon"><svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="18" r="8" stroke="rgba(212,175,55,0.5)" stroke-width="1.5" fill="rgba(212,175,55,0.08)"/><path d="M12 40c2-6 6-10 12-10s10 4 12 10" stroke="rgba(212,175,55,0.5)" stroke-width="1.5" fill="rgba(212,175,55,0.05)"/></svg></div><div class="hc-text"><div class="hc-name">Помічники: ${p.helperCount}</div></div></div>` : '');

    panel.innerHTML = `
      <div class="pp-header">
        <div class="pp-avatar ${p.character?.id && PORTRAITS[p.character.id] ? 'pp-avatar-portrait' : ''}" style="${p.character?.id && PORTRAITS[p.character.id] ? `--char-color:${p.character.color}` : `background:${p.character.color}`}">${p.character?.id && PORTRAITS[p.character.id] ? PORTRAITS[p.character.id] : p.name[0]}</div>
        <div class="pp-info">
          <div class="pp-name">${p.name} ${isCurrent ? '◀' : ''} ${p.id === myId ? '(Ви)' : ''}</div>
          <div class="pp-respect">${p.respectName} (Lv.${p.respectLevel})</div>
        </div>
        <div class="pp-money">${p.money}$</div>
      </div>
      <div class="pp-details">
        ${p.inPrison > 0 ? `<span class="pp-tag prison">${ICON.chain} ${p.inPrison} ходів</span>` : ''}
        <span class="pp-tag cards">${ICON.cards} ${p.mafiaCardCount}</span>
        ${p.disconnected ? `<span class="pp-tag prison">${ICON.signal} Відключений</span>` : ''}
        ${state.alliances?.some(a => ((a.player1 === p.id && a.player2 === myId) || (a.player1 === myId && a.player2 === p.id))) ? `<span class="pp-tag alliance">${ICON.handshake} Альянс</span>` : ''}
        <span class="pp-tag">${ICON.building} ${p.businessCount}</span>
        ${!p.alive ? '<span class="pp-tag prison">☠ Ліквідовано</span>' : ''}
      </div>
      ${helperTags}
    `;
    if (p.id === myId) {
      panel.style.cursor = 'pointer';
      panel.addEventListener('click', () => {
        SFX.click();
        showPlayerProfile(p, state);
      });
    }
    container.appendChild(panel);
  }
}

// ===== PLAYER PROFILE PANEL =====
function showPlayerProfile(player, state) {
  const levels = state.respectLevels || [];
  const currentLvl = levels.find(l => l.level === player.respectLevel) || {};
  const isMe = player.id === myId;

  // Build respect progression
  let respectHtml = '';
  for (const lvl of levels) {
    const isCurrent = lvl.level === player.respectLevel;
    const isPast = lvl.level < player.respectLevel;
    const cls = isCurrent ? 'ppr-current' : (isPast ? 'ppr-past' : 'ppr-future');
    respectHtml += `
      <div class="ppr-level ${cls}">
        <div class="ppr-lvl-header">
          <span class="ppr-lvl-name">${'★'.repeat(lvl.level)} ${lvl.name}</span>
          ${isCurrent ? '<span class="ppr-badge">ЗАРАЗ</span>' : ''}
        </div>
        <div class="ppr-lvl-perks">
          <span>Бонус START: ${lvl.startBonus}$</span>
          <span>Помічників: ${lvl.maxHelpers}</span>
          ${lvl.attackDiscount ? `<span>Знижка атак: -${lvl.attackDiscount}$</span>` : ''}
          ${lvl.canBuyOff ? '<span>Можна відкупитись від замахів</span>' : ''}
        </div>
        ${!isPast && !isCurrent && lvl.upgradeCost ? `<div class="ppr-cost">Вартість: ${lvl.upgradeCost}$</div>` : ''}
      </div>
    `;
  }

  // Build helpers
  let helpersHtml = '';
  if (isMe && player.helpers && player.helpers.length > 0) {
    for (const h of player.helpers) {
      const icon = HELPER_PORTRAITS[h.id] || '';
      helpersHtml += `
        <div class="ppr-helper">
          ${icon ? `<div class="ppr-helper-icon">${icon}</div>` : ''}
          <div class="ppr-helper-info">
            <div class="ppr-helper-name">${h.name}</div>
            <div class="ppr-helper-desc">${h.description}</div>
          </div>
          <span class="ppr-helper-badge ${h.passive ? 'passive' : 'active'}">${h.passive ? 'Пасивний' : 'Активний'}</span>
        </div>
      `;
    }
  } else if (!isMe && player.helperCount > 0) {
    helpersHtml = `<div class="ppr-helper"><div class="ppr-helper-info"><div class="ppr-helper-name">Помічників: ${player.helperCount}</div><div class="ppr-helper-desc">Деталі приховані</div></div></div>`;
  } else {
    helpersHtml = '<div class="ppr-empty">Немає помічників</div>';
  }

  // Build businesses
  let bizHtml = '';
  if (player.businesses && player.businesses.length > 0) {
    for (const bizId of player.businesses) {
      const bizState = state.businesses[bizId];
      let bizName = bizId;
      let distName = '';
      let distColor = 'var(--gold)';
      for (const d of (state.districts || [])) {
        const found = d.businesses.find(b => b.id === bizId);
        if (found) { bizName = found.name; distName = d.name; distColor = d.color; break; }
      }
      const infLvl = bizState ? (bizState.influenceLevel || 1) : 1;
      bizHtml += `
        <div class="ppr-biz">
          <div class="ppr-biz-dot" style="background:${distColor}"></div>
          <div class="ppr-biz-info">
            <div class="ppr-biz-name">${bizName}</div>
            <div class="ppr-biz-district">${distName} · ${'★'.repeat(infLvl)}</div>
          </div>
        </div>
      `;
    }
  } else {
    bizHtml = '<div class="ppr-empty">Немає бізнесів</div>';
  }

  const overlay = document.createElement('div');
  overlay.className = 'player-profile-overlay active';
  overlay.innerHTML = `
    <div class="player-profile">
      <button class="pp-close">&times;</button>
      <div class="pp-profile-header">
        <div class="pp-big-avatar ${player.character?.id && PORTRAITS[player.character.id] ? 'pp-avatar-portrait' : ''}" style="${player.character?.id && PORTRAITS[player.character.id] ? `--char-color:${player.character.color}` : `background:${player.character.color}`}">${player.character?.id && PORTRAITS[player.character.id] ? PORTRAITS[player.character.id] : player.name[0]}</div>
        <div>
          <div class="pp-profile-name">${player.name}</div>
          <div class="pp-profile-respect">${currentLvl.name || ''} · Рівень ${player.respectLevel}</div>
          <div class="pp-profile-money">${player.money}$</div>
        </div>
      </div>

      <div class="pp-section">
        <div class="pp-section-title">ПОВАГА</div>
        <div class="ppr-levels">${respectHtml}</div>
      </div>

      <div class="pp-section">
        <div class="pp-section-title">ПОМІЧНИКИ</div>
        <div class="ppr-helpers">${helpersHtml}</div>
      </div>

      <div class="pp-section">
        <div class="pp-section-title">БІЗНЕСИ</div>
        <div class="ppr-businesses">${bizHtml}</div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('.pp-close').addEventListener('click', () => {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 300);
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 300);
    }
  });
}

// ===== MONEY ANIMATION =====
function showMoneyAnimation(playerId, diff) {
  if (diff === 0) return;
  // Find the player panel's money element
  const panels = document.querySelectorAll('.player-panel');
  const state = gameState;
  if (!state) return;
  const playerIndex = state.players.findIndex(p => p.id === playerId);
  if (playerIndex < 0 || !panels[playerIndex]) return;

  const moneyEl = panels[playerIndex].querySelector('.pp-money');
  if (!moneyEl) return;

  const floater = document.createElement('div');
  floater.className = `money-float ${diff > 0 ? 'money-gain' : 'money-loss'}`;
  floater.textContent = `${diff > 0 ? '+' : ''}${diff}$`;
  moneyEl.style.position = 'relative';
  moneyEl.appendChild(floater);

  // Also animate the top bar money if it's our player
  if (playerId === myId) {
    const topMoney = document.querySelector('#my-money');
    if (topMoney) {
      const topFloater = document.createElement('div');
      topFloater.className = `money-float ${diff > 0 ? 'money-gain' : 'money-loss'}`;
      topFloater.textContent = `${diff > 0 ? '+' : ''}${diff}$`;
      topMoney.style.position = 'relative';
      topMoney.appendChild(topFloater);
      setTimeout(() => topFloater.remove(), 2000);
    }
  }

  setTimeout(() => floater.remove(), 2000);
}

// ===== TOP BAR =====
function renderTopBar(state) {
  const me = state.players.find(p => p.id === myId);
  if (me) {
    $('#my-money').textContent = `${me.money}$`;
  }
  const current = state.players[state.currentPlayerIndex];
  if (current) {
    const phaseLabels = {
      roll: 'Кидок',
      resolve: 'Розіграш',
      action: 'Дія',
      end: 'Фініш'
    };
    const phaseLabel = phaseLabels[state.turnPhase] || 'Хід';
    const roundInfo = state.currentRound ? `<span class="turn-round">Коло ${state.currentRound}</span>` : '';
    $('#turn-info').innerHTML = `
      <span class="turn-label">Хід ${state.turnNumber}</span>
      <span class="turn-phase-badge phase-${state.turnPhase || 'action'}">${phaseLabel}</span>
      <span class="turn-current-wrap">
        <span class="turn-current-prefix">Активний гравець</span>
        <span class="current-player">${current.name}</span>
      </span>
      ${roundInfo}
    `;
  }
  // Show/hide surrender button
  const surrenderBtn = $('#btn-surrender');
  if (surrenderBtn) {
    surrenderBtn.style.display = (me && me.alive && state.phase === 'playing') ? '' : 'none';
  }
  // Show/hide restart button (host only, game in progress or finished)
  const restartBtn = $('#btn-restart');
  if (restartBtn) {
    const isHost = state.hostId === myId;
    restartBtn.style.display = (isHost && (state.phase === 'playing' || state.phase === 'finished')) ? '' : 'none';
  }
}

function getSectorCoachData(state, player) {
  if (!state || !player) return null;
  const sector = (state.board || []).find(s => s.index === player.position);
  if (!sector) return null;

  if (sector.type === 'business') {
    const district = state.districts?.find(d => d.id === sector.districtId);
    const biz = district?.businesses?.[sector.businessIndex];
    const bizState = biz ? state.businesses?.[biz.id] : null;
    return {
      title: biz?.name || 'Бізнес',
      subtitle: district?.name || 'Район',
      tone: district?.color || 'var(--gold)',
      text: bizState?.owner
        ? `Бізнес уже під контролем. Стежте за рентою, викупом та впливом у районі.`
        : `Вільний бізнес. Якщо зупинитесь тут у свій хід, зможете купити його або запустити аукціон.`
    };
  }

  const info = {
    START: {
      title: 'START',
      subtitle: 'Прохідний бонус',
      tone: '#3ecf8e',
      text: 'За прохід отримуєте гроші за рівнем поваги та 1 карту MAFIA.'
    },
    BAR: {
      title: 'BAR',
      subtitle: 'Помічники та казино',
      tone: '#d18b47',
      text: 'Тут наймають помічників, запускають казино і деякі події ведуть саме сюди.'
    },
    MAFIA: {
      title: 'MAFIA',
      subtitle: 'Колода впливу',
      tone: '#c9a84c',
      text: 'Берете карти MAFIA: атаки, захист, економіку та брудні трюки.'
    },
    EVENT: {
      title: 'EVENT',
      subtitle: 'Непередбачуваність',
      tone: '#7bb6ff',
      text: 'Подія може дати бонус, штраф, рух, BAR або нові карти.'
    },
    POLICE: {
      title: 'ПОЛІЦІЯ',
      subtitle: 'Ризик і контроль',
      tone: '#6fa8ff',
      text: 'Поліція може дати штраф, свободу дій або запустити окремий вибір.'
    },
    PRISON: {
      title: "В'ЯЗНИЦЯ",
      subtitle: 'Пауза під тиском',
      tone: '#e86b6b',
      text: 'У тюрмі втрачаєте темп. Адвокат звільняє миттєво, а чужий бізнес стає вразливішим.'
    }
  };
  return info[sector.type] || null;
}

function getCoachMessage(state, me, isMyTurn) {
  if (!me) return 'Підключення до матчу...';
  if (!me.alive) return 'Ви вибули з гри. Можна стежити за матчем, хронікою та боротьбою інших сімей.';
  if (me.inPrison > 0 && state.turnPhase === 'roll' && isMyTurn) {
    return "Ви у в'язниці: кидайте кубики на звільнення або використайте Адвоката, якщо він є в руці.";
  }
  if (phonePendingBelongsToPlayer(state.pendingAction, myId) || state.pendingAction?.playerId === myId) {
    return 'Зараз гра чекає саме вашого рішення. Завершіть вибір у центрі поля, щоб матч пішов далі.';
  }
  if (isMyTurn && state.turnPhase === 'roll') {
    return 'Почніть хід кидком кубиків. Прохід через START дає гроші й карту MAFIA.';
  }
  if (isMyTurn && state.turnPhase === 'action') {
    return 'Після руху можна грати карти MAFIA, використовувати здібності помічників, торгувати або завершити хід.';
  }
  if (state.pendingAction?.type === 'auction') {
    return 'Йде аукціон. Слідкуйте за таймером і капіталом: виграє остання жива ставка.';
  }
  const current = state.players?.[state.currentPlayerIndex];
  return current
    ? `Зараз хід ${current.name}. Можна оцінити його бізнеси, карти та підготувати свій наступний крок.`
    : 'Очікуйте продовження матчу.';
}

function renderActionSidebar(state, me, isMyTurn) {
  const panel = $('#action-panel');
  if (!panel || !me) return;

  const sectorInfo = getSectorCoachData(state, me);
  panel.innerHTML = sectorInfo ? `
    <div class="coach-card coach-card-sector" style="--coach-tone:${sectorInfo.tone}">
      <div class="coach-kicker">ДЕ ВИ ЗАРАЗ</div>
      <div class="coach-title">${sectorInfo.title}</div>
      <div class="coach-subtitle">${sectorInfo.subtitle}</div>
      <p class="coach-text">${sectorInfo.text}</p>
    </div>
  ` : '';
}

// ===== ACTION PANEL =====
function renderActionPanel(state) {
  const isMyTurn = state.currentPlayerId === myId;
  const me = state.players.find(p => p.id === myId);
  const btnRoll = $('#btn-roll');
  const actionBtns = $('#action-buttons');
  actionBtns.innerHTML = '';

  btnRoll.disabled = !(isMyTurn && state.turnPhase === 'roll' && me && me.inPrison <= 0);
  btnRoll.textContent = isMyTurn && state.turnPhase === 'roll' ? 'Кинути кубики' : 'Очікуйте...';

  if (isMyTurn && state.turnPhase === 'action' && !state.pendingAction) {
    if (me.canUpgradeRespect && me.respectLevel < 5) {
      const btn = createActionBtn('Підвищити повагу', () => {
        SFX.respectUp();
        socket.emit('upgradeRespect', {}, handleResult);
      });
      actionBtns.appendChild(btn);
    }

    // Cappo Corrado extra step is now handled via pending action (extra_step_choice)

    // Stanley Pollak: buy influence on any owned business
    if (me.helpers && me.helpers.some(h => h.ability === 'buyInfluenceAnywhere')) {
      const upgradeableBiz = (me.businesses || []).filter(bizId => {
        const bs = state.businesses[bizId];
        return bs && bs.owner === myId && (bs.influenceLevel || 0) < 4;
      });
      if (upgradeableBiz.length > 0) {
        const btn = createActionBtn('Купити вплив (Поллак)', () => {
          SFX.click();
          // Show business selection
          const bizButtons = upgradeableBiz.map(bizId => {
            const dist = state.districts.find(d => d.businesses.some(b => b.id === bizId));
            const biz = dist ? dist.businesses.find(b => b.id === bizId) : null;
            const bs = state.businesses[bizId];
            const cost = dist ? dist.influenceCost : 0;
            return {
              text: `${biz ? biz.name : bizId} (★${bs.influenceLevel || 0}) — ${cost}$`,
              action: () => {
                SFX.buy();
                socket.emit('useHelperAbility', { ability: 'buyInfluenceAnywhere', data: { businessId: bizId } }, handleResult);
                hideCenterPanel();
              }
            };
          });
          bizButtons.push({ text: 'Скасувати', action: hideCenterPanel, cls: 'btn-secondary' });
          showCenterPanel('Стенлі Поллак', 'Оберіть бізнес для збільшення впливу:', bizButtons);
        });
        actionBtns.appendChild(btn);
      }
    }

    // Mad Dog: free ambush
    if (me.helpers && me.helpers.some(h => h.ability === 'freeAmbush')) {
      const btn = createActionBtn('Скажений Пес (Засідка)', () => {
        SFX.attack();
        const others = state.players.filter(p => p.id !== myId && p.alive);
        showCenterPanel('Скажений Пес', 'Оберіть ціль для засідки:', others.map(p => ({
          text: `${p.name} (${p.respectName})`,
          action: () => {
            socket.emit('useMadDog', { targetId: p.id }, handleResult);
            hideCenterPanel();
          },
          cls: 'btn-danger'
        })).concat([{ text: 'Скасувати', action: hideCenterPanel, cls: 'btn-secondary' }]));
      });
      actionBtns.appendChild(btn);
    }

    // Lenny Pike "Шпигун": peek at another player's cards (1x per round)
    if (me.helpers && me.helpers.some(h => h.ability === 'spyCards')) {
      const btn = createActionBtn('Шпигун (Щука)', () => {
        SFX.click();
        const others = state.players.filter(p => p.id !== myId && p.alive);
        showCenterPanel('Ленні «Щука»', 'Оберіть гравця, чиї карти побачити:', others.map(p => ({
          text: `${p.name}`,
          action: () => {
            socket.emit('useHelperAbility', { ability: 'spyCards', data: { targetId: p.id } }, (res) => {
              hideCenterPanel();
              if (res && res.error) { handleResult(res); return; }
              if (res && res.type === 'spy_result') {
                const cardList = res.cards && res.cards.length > 0
                  ? res.cards.map(c => `<div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.1)"><strong>${c.name}</strong> <span style="color:var(--text-secondary);font-size:12px">(${c.type})</span></div>`).join('')
                  : '<div style="color:var(--text-secondary)">Карт немає</div>';
                showCenterPanel(`${ICON.eye} Шпигун`, `Карти MAFIA у ${res.targetName}:`, [{ text: 'OK', action: () => hideCenterPanel() }], `<div style="margin:10px 0;text-align:left">${cardList}</div>`);
              }
            });
          }
        })).concat([{ text: 'Скасувати', action: hideCenterPanel, cls: 'btn-secondary' }]));
      });
      actionBtns.appendChild(btn);
    }

    // Tommy Morello "Дипломат": cancel a card against you (1x per game)
    if (me.helpers && me.helpers.some(h => h.ability === 'diplomat') && !me._tommyUsed) {
      // Only show when there's a pending action targeting the player
      const a = state.pendingAction;
      const canUse = a && (a.targetId === myId || (a.type === 'attack_reaction' && a.targetId === myId));
      if (canUse) {
        const btn = createActionBtn('Дипломат (Морелло)', () => {
          SFX.click();
          socket.emit('useHelperAbility', { ability: 'diplomat', data: {} }, handleResult);
        });
        btn.classList.add('btn-gold');
        actionBtns.appendChild(btn);
      }
    }

    // Trade button
    const tradeBtn = createActionBtn(`${ICON.trade} Торгівля`, () => {
      SFX.click();
      const others = state.players.filter(p => p.id !== myId && p.alive);
      showCenterPanel('Торгівля', 'Оберіть гравця для угоди:', others.map(p => ({
        text: p.name,
        action: () => { hideCenterPanel(); showTradeUI(p); }
      })).concat([{ text: 'Скасувати', action: hideCenterPanel, cls: 'btn-secondary' }]));
    }, 'btn-secondary');
    actionBtns.appendChild(tradeBtn);

    // Alliance button
    const allyBtn = createActionBtn(`${ICON.handshake} Альянс`, () => {
      SFX.click();
      const others = state.players.filter(p => p.id !== myId && p.alive);
      showCenterPanel('Альянс', 'Оберіть гравця для альянсу:', others.map(p => ({
        text: `${p.name} ${state.alliances?.some(a => a.active !== false && ((a.player1 === myId && a.player2 === p.id) || (a.player1 === p.id && a.player2 === myId))) ? '(вже союзник)' : ''}`,
        action: () => { hideCenterPanel(); showAllianceUI(p); }
      })).concat([{ text: 'Скасувати', action: hideCenterPanel, cls: 'btn-secondary' }]));
    }, 'btn-secondary');
    actionBtns.appendChild(allyBtn);

    const endBtn = createActionBtn(`${ICON.check} Завершити хід`, () => {
      SFX.click();
      socket.emit('endTurn', {}, handleResult);
    }, 'btn-secondary');
    actionBtns.appendChild(endBtn);

    // Surrender button moved to topbar
  }

  if (isMyTurn && me && me.inPrison > 0 && state.turnPhase === 'roll') {
    btnRoll.disabled = false;
    btnRoll.innerHTML = `${ICON.chain} У в'язниці (${me.inPrison})`;
    if (me.mafiaCards && me.mafiaCards.some(c => c.id === 'lawyer')) {
      const btn = createActionBtn('Використати Адвоката', () => {
        SFX.buy();
        socket.emit('playMafiaCard', { cardId: 'lawyer' }, handleResult);
      });
      actionBtns.appendChild(btn);
    }
  }

  if (me) renderActionSidebar(state, me, isMyTurn);
}

function createActionBtn(text, onClick, extraClass = '') {
  const btn = document.createElement('button');
  btn.className = `btn ${extraClass || 'btn-primary'}`;
  btn.innerHTML = text;
  btn.addEventListener('click', onClick);
  return btn;
}

// ===== MAFIA CARDS =====
function renderMyBusinesses(state) {
  const list = $('#my-businesses-list');
  list.innerHTML = '';
  const me = state.players.find(p => p.id === myId);
  if (!me || !me.businesses || me.businesses.length === 0) {
    list.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:4px">Немає бізнесів</div>';
    return;
  }
  for (const bizId of me.businesses) {
    const bizState = state.businesses[bizId];
    if (!bizState) continue;
    const district = state.districts.find(d => d.id === bizState.districtId);
    if (!district) continue;
    const biz = district.businesses.find(b => b.id === bizId);
    if (!biz) continue;
    const stars = '★'.repeat(bizState.influenceLevel || 0);
    const el = document.createElement('div');
    el.className = 'my-biz-card';
    el.innerHTML = `
      <div class="biz-card-header">
        <span class="biz-card-dot" style="background:${district.color}"></span>
        <span class="biz-card-name">${biz.name}</span>
        <span class="biz-card-stars">${stars}</span>
      </div>
      <div class="biz-card-info">${district.name} · Рента: ${biz.rent.join('/')}</div>
    `;
    list.appendChild(el);
  }
}

function renderMafiaCards(state) {
  const me = state.players.find(p => p.id === myId);
  const list = $('#mafia-cards-list');
  list.innerHTML = '';
  if (!me || !me.mafiaCards) return;

  const isLocked = card => card.type === 'attack' && state.currentRound < state.mafiaCardMinRound;

  for (const card of me.mafiaCards) {
    const locked = isLocked(card);
    const el = document.createElement('div');
    el.className = `mafia-card ${card.type} ${locked ? 'locked' : ''}`;
    el.innerHTML = `
      <div class="mc-name">${card.name}</div>
      ${card.cost > 0 ? `<div class="mc-cost">${card.cost}$</div>` : ''}
      <div class="mc-desc">${card.description}</div>
      ${locked ? `<div class="mc-locked">${ICON.lock} з ${state.mafiaCardMinRound}-го кола</div>` : ''}
    `;
    el.addEventListener('click', () => onMafiaCardClickExtended(card, state));
    list.appendChild(el);
  }
}

function onMafiaCardClick(card, state) {
  const isMyTurn = state.currentPlayerId === myId;
  if (!isMyTurn || state.turnPhase !== 'action') return;

  // Check round lock for attack cards
  if (card.type === 'attack' && state.currentRound < state.mafiaCardMinRound) {
    showEventDisplay(`<p style="color:var(--red-light)">${ICON.lock} Карти атаки доступні з ${state.mafiaCardMinRound}-го кола! (зараз коло ${state.currentRound})</p>`, 2500);
    return;
  }

  SFX.mafia();

  if (card.type === 'attack' || card.id === 'rumors' || card.id === 'kompromat') {
    showTargetSelectionModal(card, state);
  } else if (card.id === 'bomb') {
    showBombSectorPicker();
  } else if (card.id === 'lawyer') {
    socket.emit('playMafiaCard', { cardId: 'lawyer' }, (r) => handleCardResult('lawyer', r));
  } else if (card.id === 'raider' || card.id === 'pogrom') {
    socket.emit('playMafiaCard', { cardId: card.id }, (r) => handleCardResult(card.id, r));
  }
}

// ===== DICE =====
$('#btn-roll').addEventListener('click', () => {
  SFX.diceRoll();
  hideEventDisplay();
  socket.emit('rollDice', {}, (res) => {
    if (res.error) return notifyError(res.error, { title: 'Кидок кубиків' });
    // BAR action from wedding event — pending action will be shown via gameState
    if (res.barAction) {
      return;
    }
    // Prison result — show message, turn auto-ends on server
    if (res.inPrison !== undefined && !res.dice) {
      if (res.released) {
        SFX.win();
        showCenterMessage('Свобода!', "Ви вийшли з в'язниці! Наступний хід ваш.", 3000);
      } else {
        SFX.prisonDoor();
        showCenterMessage("В'язниця", `Ще ${res.turnsLeft} хід(ів). Хід завершується автоматично.`, 2000);
      }
      return;
    }
    let animDelay = 600;
    if (res.dice) {
      showDice(res.dice);
      // Show dice + movement in center of board
      const me = gameState ? gameState.players.find(p => p.id === myId) : null;
      const playerName = me ? me.name : '???';
      showCenterInfo(playerName, res.dice, res.total, res.oldPos, res.newPos, res.landingSector);
      // Calculate animation duration
      if (res.oldPos !== undefined && res.newPos !== undefined) {
        const steps = ((res.newPos - res.oldPos + 36) % 36) || 1;
        animDelay = steps * 350 + 500;
        // Set global delay so gameState handler waits before showing pending actions
        pendingActionDelay = Date.now() + animDelay;
        animateTokenMovement(myId, res.oldPos, res.newPos);
      }
    }
    // Card reveal for MAFIA/EVENT draws — show after animation, confirm on OK
    if (res.landingResult) {
      const lr = res.landingResult;
      if (lr.type === 'mafia' && lr.cards && lr.cards.length > 0) {
        setTimeout(() => {
          showCardReveal('mafia', 'КАРТА MAFIA', lr.cards.map(c => c.name).join(', '),
            lr.cards.map(c => c.description).join('\n'), () => {
              confirmedPendingId = makePendingKey({ type: 'mafia_confirm', playerId: myId }, gameState);
              socket.emit('resolveAction', { actionType: 'mafia_confirm', data: {} }, handleResult);
            });
        }, animDelay);
      } else if (lr.type === 'event' && lr.card) {
        setTimeout(() => {
          showCardReveal('event', 'ПОДІЯ', lr.card.name, lr.card.description, () => {
            confirmedPendingId = makePendingKey({ type: 'event_confirm', playerId: myId, card: lr.card }, gameState);
            socket.emit('resolveAction', { actionType: 'event_confirm', data: {} }, handleResult);
          });
        }, animDelay);
      }
    }
  });
});

function showDice(dice) {
  const display = $('#dice-display');
  display.innerHTML = '';
  const pipLayouts = {
    1: [5], 2: [3, 7], 3: [3, 5, 7],
    4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9]
  };
  for (const d of dice) {
    const die = document.createElement('div');
    die.className = 'die';
    const positions = pipLayouts[d] || [];
    for (let i = 1; i <= 9; i++) {
      const cell = document.createElement('div');
      if (positions.includes(i)) cell.className = 'die-pip';
      die.appendChild(cell);
    }
    display.appendChild(die);
  }
}

// ===== PENDING ACTIONS (center panel instead of modal for most) =====
function handlePendingAction(state) {
  const action = state.pendingAction;
  if (!action) {
    confirmedPendingId = null; // reset when no pending action
    hideCenterPanel();
    hideModal();
    hideAuctionPanel();
    return;
  }
  // Clear confirmedPendingId if a new/different pending action appeared
  if (confirmedPendingId) {
    const actionKey = makePendingKey(action, state);
    if (confirmedPendingId !== actionKey) {
      confirmedPendingId = null;
    }
  }

  // Safety: if action exists but isn't an auction, make sure auction overlay is hidden
  if (action.type !== 'auction') {
    const auctionOverlay = document.getElementById('auction-overlay');
    if (auctionOverlay && auctionOverlay.classList.contains('active')) {
      hideAuctionPanel();
    }
  }

  // Defer if card reveal is still showing (e.g. event card before secondary landing)
  if (cardRevealActive) return;

  if (action.playerId && action.playerId !== myId) {
    // Show what's happening to other players in event display
    if (action.type === 'buy_business' || action.type === 'pay_rent') {
      const current = state.players[state.currentPlayerIndex];
      if (current && current.id !== myId) {
        showEventDisplay(`<p>${current.name} приймає рішення...</p>`, 2000);
      }
    }
    return;
  }

  switch (action.type) {
    case 'extra_step_choice':
      SFX.event();
      showCenterPanel(
        'Капо Коррадо',
        `Ви на клітині "${action.currentSectorName}". Крокнути вперед на "${action.nextSectorName}"?`,
        [
          { text: 'Крокнути вперед', action: () => {
            SFX.click();
            socket.emit('resolveAction', { actionType: 'extra_step_choice', data: { useStep: true } }, handleResult);
            hideCenterPanel();
          }},
          { text: 'Залишитись тут', action: () => {
            SFX.click();
            socket.emit('resolveAction', { actionType: 'extra_step_choice', data: { useStep: false } }, handleResult);
            hideCenterPanel();
          }, cls: 'btn-secondary' }
        ]
      );
      break;

    case 'buy_business':
      SFX.event();
      showBusinessCard(action);
      break;

    case 'seize_prison_business':
      SFX.event();
      showCenterPanel(
        `${ICON.lock} ${action.ownerName} у в'язниці!`,
        `${action.name} без захисту. Купити за ${action.price}$?`,
        [
          { text: `Захопити (${action.price}$)`, action: () => {
            SFX.buy();
            socket.emit('resolveAction', { actionType: 'seize_prison_business', data: { businessId: action.businessId, buy: true } }, handleResult);
            hideCenterPanel();
          }},
          { text: 'Пропустити', action: () => {
            socket.emit('resolveAction', { actionType: 'seize_prison_business', data: { businessId: action.businessId, buy: false } }, handleResult);
            hideCenterPanel();
          }, cls: 'btn-secondary' }
        ]
      );
      break;

    case 'pay_rent':
      SFX.payRent();
      showCenterPanel('Оплата рахунків', `${action.businessName}: ${action.amount}$`, [
        { text: `Заплатити ${action.amount}$`, action: () => {
          socket.emit('resolveAction', { actionType: 'pay_rent', data: { useRobbery: false } }, handleResult);
          hideCenterPanel();
        }},
        ...(action.canRob ? [{
          text: `${ICON.gun} Пограбувати!`, action: () => {
            SFX.attack();
            socket.emit('resolveAction', { actionType: 'pay_rent', data: { useRobbery: true } }, handleResult);
            hideCenterPanel();
          }, cls: 'btn-danger'
        }] : []),
        ...(action.canBuyout ? [{
          text: `${ICON.building} Викупити (${action.buyoutPrice}$)`, action: () => {
            SFX.buy();
            socket.emit('resolveAction', { actionType: 'buyout_business', data: { businessId: action.businessId } }, handleResult);
            hideCenterPanel();
          }, cls: 'btn-casino'
        }] : [])
      ]);
      break;

    case 'police_landing_choice':
      SFX.event();
      showCenterPanel(`${ICON.police} Поліція`, 'Оберіть дію:', action.choices.map(c => ({
        text: c.label,
        action: () => {
          SFX.buy();
          socket.emit('resolveAction', { actionType: 'police_choice', data: { choiceId: c.id } }, handleResult);
          hideCenterPanel();
        },
        cls: c.id.startsWith('snitch_') ? 'btn-danger' : ''
      })));
      break;

    case 'prison_visit_choice':
      if (action.playerId === myId) {
        SFX.event();
        showCenterPanel(`${ICON.chain} Відвідування в'язниці`, 'Оберіть дію:', action.choices.map(c => ({
          text: c.label,
          action: () => {
            SFX.buy();
            socket.emit('resolveAction', { actionType: 'prison_visit_choice', data: { choiceId: c.id } }, handleResult);
            hideCenterPanel();
          },
          cls: c.id.startsWith('free_') ? 'btn-secondary' : (c.id === 'grab_cash' ? '' : 'btn-secondary')
        })));
      }
      break;

    case 'start_bonus_choice':
      SFX.win();
      showCenterPanel('Бонус START!', 'Оберіть один бонус:', action.choices.map(c => ({
        text: c.label,
        action: () => {
          SFX.buy();
          socket.emit('resolveAction', { actionType: 'start_bonus', data: { choiceId: c.id } }, handleResult);
          hideCenterPanel();
        }
      })));
      break;

    case 'bar_choice':
      showCenterPanel('BAR', 'Що бажаєте?', action.choices.map(c => ({
        text: c.label,
        action: () => {
          SFX.click();
          socket.emit('resolveAction', { actionType: 'bar_choice', data: { choiceId: c.id } }, handleResult);
          hideCenterPanel();
          if (c.id === 'casino') setTimeout(showCasino, 300);
        },
        cls: c.id === 'casino' ? 'btn-casino' : ''
      })));
      break;

    case 'choose_hidden_helper':
      showHiddenHelperChoice(action.cardCount || 3);
      break;

    case 'choose_own_helper_to_release': {
      if (action.playerId !== myId) break;
      const tgt = state.players.find(p => p.id === action.targetId);
      showChooseOwnHelperToRelease(action.ownHelpers || [], tgt ? tgt.name : 'ворога');
      break;
    }

    case 'choose_stolen_helper': {
      if (action.playerId !== myId) break; // only the card player sees the pick
      const tgt = state.players.find(p => p.id === action.targetId);
      showStolenHelperChoice(action.helperCount || 1, !!action.isSwap, tgt ? tgt.name : '', action.ownHelperName);
      break;
    }

    case 'hire_another':
      showCenterPanel('Найняти ще?', 'Ви можете найняти ще одного помічника (1000$).', [
        { text: 'Найняти (1000$)', action: () => {
          SFX.buy();
          socket.emit('resolveAction', { actionType: 'hire_helper', data: {} }, handleResult);
          hideCenterPanel();
        }},
        { text: 'Ні', action: () => {
          socket.emit('resolveAction', { actionType: 'decline_hire', data: {} }, handleResult);
          hideCenterPanel();
        }, cls: 'btn-secondary' }
      ]);
      break;

    case 'casino':
      showCasino();
      break;

    // police_bonus_choice removed — replaced by police_landing_choice

    case 'pay_or_prison':
      SFX.prisonDoor();
      showCenterPanel('Федерали!', `Заплатіть ${action.amount}$ або в'язниця на 2 ходи.`, [
        { text: `Заплатити ${action.amount}$`, action: () => {
          SFX.payRent();
          socket.emit('resolveAction', { actionType: 'pay_or_prison', data: { pay: true } }, handleResult);
          hideCenterPanel();
        }},
        { text: "В'язниця", action: () => {
          SFX.prisonDoor();
          socket.emit('resolveAction', { actionType: 'pay_or_prison', data: { pay: false } }, handleResult);
          hideCenterPanel();
        }, cls: 'btn-danger' }
      ]);
      break;

    case 'choose_lose_helper': {
      const me = state.players.find(p => p.id === myId);
      if (!me) break;
      SFX.lose();
      showCenterPanel('Втрата помічника', `${action.reason}. Оберіть помічника:`, me.helpers.map((h, i) => ({
        text: h.name,
        action: () => {
          socket.emit('resolveAction', { actionType: 'choose_lose_helper', data: { helperIndex: i } }, handleResult);
          hideCenterPanel();
        }
      })));
      break;
    }

    case 'choose_influence_business':
      showCenterPanel('Додати вплив', 'Оберіть бізнес для збільшення впливу:', (action.businesses || []).map(b => ({
        text: `${b.name} (${'★'.repeat(b.currentLevel || 0)})`,
        action: () => {
          SFX.buy();
          socket.emit('resolveAction', { actionType: 'choose_influence_business', data: { businessId: b.id } }, handleResult);
          hideCenterPanel();
        }
      })));
      break;

    case 'discard_mafia_cards': {
      const me = state.players.find(p => p.id === myId);
      if (!me) break;
      SFX.lose();
      const needed = action.count;
      const selected = [];
      const panel = $('#center-panel');
      function renderDiscardPanel() {
        let html = `<h3>Скинути карти</h3>`;
        html += `<p>Оберіть ${needed} карт(и) MAFIA для скидання (обрано: ${selected.length}/${needed}):</p>`;
        html += '<div class="center-buttons">';
        for (let i = 0; i < me.mafiaCards.length; i++) {
          const c = me.mafiaCards[i];
          const isSelected = selected.includes(i);
          html += `<button class="btn ${isSelected ? 'btn-danger' : 'btn-secondary'}" data-card-idx="${i}">${c.name}${isSelected ? ' ✓' : ''}</button>`;
        }
        if (selected.length >= needed) {
          html += `<button class="btn btn-primary" id="discard-confirm">Підтвердити скидання</button>`;
        }
        html += '</div>';
        panel.innerHTML = html;
        panel.classList.add('active');
        panel.querySelectorAll('[data-card-idx]').forEach(btn => {
          btn.addEventListener('click', () => {
            SFX.click();
            const idx = parseInt(btn.dataset.cardIdx);
            const pos = selected.indexOf(idx);
            if (pos >= 0) {
              selected.splice(pos, 1);
            } else if (selected.length < needed) {
              selected.push(idx);
            }
            renderDiscardPanel();
          });
        });
        const confirmBtn = panel.querySelector('#discard-confirm');
        if (confirmBtn) {
          confirmBtn.addEventListener('click', () => {
            socket.emit('resolveAction', { actionType: 'discard_mafia', data: { cardIndices: [...selected] } }, handleResult);
            hideCenterPanel();
          });
        }
      }
      renderDiscardPanel();
      break;
    }

    case 'bomb_choose_helper': {
      const me = state.players.find(p => p.id === myId);
      if (!me) break;
      showExplosion(me.name);
      setTimeout(() => {
      showCenterPanel(`${ICON.bomb} Вибух бомби!`, 'Оберіть помічника, який загине:', me.helpers.map((h, i) => ({
        text: h.name,
        action: () => {
          socket.emit('resolveAction', { actionType: 'bomb_choose_helper', data: { helperIndex: i } }, handleResult);
          hideCenterPanel();
        }
      })));
      }, 1500); // show after explosion
      break;
    }

    case 'attack_reaction':
      if (action.targetId === myId) {
        showAttackAlert(action);
      }
      break;

    case 'choose_kill_helper':
      if (action.attackerId === myId) {
        const targetP = state.players.find(p => p.id === action.targetId);
        const helpersList = action.targetHelpers || [];
        if (helpersList.length === 0) break;
        showKillHelperChoice(targetP ? targetP.name : 'ворога', helpersList, (idx) => {
          socket.emit('resolveAction', { actionType: 'choose_kill_helper', data: { attackerId: action.attackerId, targetId: action.targetId, helperIndex: idx } }, handleResult);
        });
      } else {
        // Attacker is another player/bot — show waiting
        const attackerP = state.players.find(p => p.id === action.attackerId);
        showCenterPanel('Замах', `${attackerP ? attackerP.name : 'Атакуючий'} обирає помічника...`, []);
      }
      break;

    case 'upgrade_influence_on_own':
      if (action.playerId === myId) {
        SFX.event();
        const curLvl = action.currentLevel || 1;
        showCenterPanel('Збільшити вплив?', `${action.businessName} (${action.districtName})\nПоточний рівень: ${'★'.repeat(curLvl)} → ${'★'.repeat(curLvl + 1)}\nВартість: ${action.cost}$`, [
          { text: `Збільшити ★ (${action.cost}$)`, action: () => {
            SFX.buy();
            socket.emit('resolveAction', { actionType: 'upgrade_influence', data: { upgrade: true } }, handleResult);
            hideCenterPanel();
          }},
          { text: 'Ні', action: () => {
            socket.emit('resolveAction', { actionType: 'upgrade_influence', data: { upgrade: false } }, handleResult);
            hideCenterPanel();
          }, cls: 'btn-secondary' }
        ]);
      }
      break;

    case 'mafia_card_drawn':
      if (action.playerId === myId && action.card) {
        showCardReveal('mafia', 'КАРТА MAFIA', action.card.name, action.card.description, () => {
          hideCenterPanel();
        });
      }
      break;

    case 'mafia_confirm': {
      const mafiaKey = makePendingKey(action, state);
      if (confirmedPendingId === mafiaKey) break; // already confirmed, skip re-show
      if (action.playerId === myId && action.cards && action.cards.length > 0) {
        const peekInfo = action.peekCard ? `\n\n👁 Наступна карта в колоді: ${action.peekCard.name}` : '';
        showCardReveal('mafia', 'КАРТА MAFIA', action.cards.map(c => c.name).join(', '),
          action.cards.map(c => c.description).join('\n') + peekInfo, () => {
            confirmedPendingId = mafiaKey;
            socket.emit('resolveAction', { actionType: 'mafia_confirm', data: {} }, handleResult);
          });
      }
      break;
    }

    case 'event_confirm': {
      const eventKey = makePendingKey(action, state);
      if (confirmedPendingId === eventKey) break; // already confirmed, skip re-show
      if (action.playerId === myId && action.card) {
        showCardReveal('event', 'ПОДІЯ', action.card.name, action.card.description, () => {
          confirmedPendingId = eventKey;
          socket.emit('resolveAction', { actionType: 'event_confirm', data: {} }, handleResult);
        });
      }
      break;
    }

    case 'event_card_drawn':
      if (action.card) {
        showCardReveal('event', 'ПОДІЯ', action.card.name, action.card.description, () => {
          hideCenterPanel();
        });
      }
      break;

    case 'jackpot_choose_business': {
      showJackpotChooseOverlay(state);
      break;
    }

    case 'auction': {
      const meForAuction = state.players.find(p => p.id === myId);
      if (!meForAuction || !meForAuction.alive) break;
      showAuctionPanel(action, state);
      break;
    }

    case 'trade_offer':
      if (action.playerId === myId) {
        const offerDesc = [];
        if (action.offer.giveMoney) offerDesc.push(`${action.fromName} дає ${action.offer.giveMoney}$`);
        if (action.offer.wantMoney) offerDesc.push(`Хоче ${action.offer.wantMoney}$`);
        if (action.offer.giveBusiness?.length) offerDesc.push(`Дає бізнеси: ${action.offer.giveBusiness.length}`);
        if (action.offer.wantBusiness?.length) offerDesc.push(`Хоче бізнеси: ${action.offer.wantBusiness.length}`);
        SFX.event();
        showCenterPanel(`Угода від ${action.fromName}`, offerDesc.join('\n'), [
          { text: 'Прийняти', action: () => {
            socket.emit('tradeResponse', { accept: true }, handleResult);
            hideCenterPanel();
          }},
          { text: 'Відхилити', action: () => {
            socket.emit('tradeResponse', { accept: false }, handleResult);
            hideCenterPanel();
          }, cls: 'btn-danger' }
        ]);
      }
      break;

    case 'alliance_offer':
      if (action.playerId === myId) {
        SFX.event();
        showCenterPanel(`Альянс від ${action.fromName}`, `${action.fromName} пропонує альянс на ${action.rounds} кола. Ви не зможете атакувати один одного.`, [
          { text: 'Прийняти', action: () => {
            socket.emit('allianceResponse', { accept: true }, handleResult);
            hideCenterPanel();
          }},
          { text: 'Відхилити', action: () => {
            socket.emit('allianceResponse', { accept: false }, handleResult);
            hideCenterPanel();
          }, cls: 'btn-danger' }
        ]);
      }
      break;

    default:
      // Unknown pending action type — log & don't trap user
      console.warn('[handlePendingAction] Unknown action type:', action.type, action);
      break;
  }
}

// ===== MODALS (still used for attack, casino, complex actions) =====
function showModal(title, description, buttons) {
  const overlay = $('#modal-overlay');
  const content = $('#modal-content');
  content.innerHTML = `
    <h2>${title}</h2>
    <p>${description}</p>
    <div class="modal-buttons"></div>
  `;
  const btnContainer = content.querySelector('.modal-buttons');
  for (const btn of buttons) {
    const el = document.createElement('button');
    el.className = `btn ${btn.cls || 'btn-primary'}`;
    el.textContent = btn.text;
    if (btn.disabled) {
      el.disabled = true;
      el.style.opacity = '0.4';
      el.style.cursor = 'not-allowed';
    } else if (btn.action) {
      // Debounce: disable button immediately on click to prevent double-fire
      el.addEventListener('click', () => {
        if (el.disabled) return;
        el.disabled = true;
        el.style.opacity = '0.6';
        try { btn.action(); } catch(e) { console.error(e); }
        // Re-enable after short delay in case modal stays open (nested flow)
        setTimeout(() => { el.disabled = false; el.style.opacity = ''; }, 1000);
      });
    }
    btnContainer.appendChild(el);
  }
  overlay.classList.add('active');
}

function hideModal() {
  $('#modal-overlay').classList.remove('active');
}

function showTargetSelectionModal(card, state) {
  const me = state.players.find(p => p.id === myId);
  const others = state.players.filter(p => p.id !== myId && p.alive);

  // Check district restriction client-side for better UX
  const districtSectors = {
    trushchoby: [2,3,4], ghetto: [7,8,9], spalniy: [12,13,14],
    promzona: [15,16,17], elitnyy: [20,21,22], turystychnyy: [25,26,27],
    red_light: [30,31,32], dilovyy: [33,34,35]
  };
  function getDistrict(pos) {
    for (const [d, sectors] of Object.entries(districtSectors)) {
      if (sectors.includes(pos)) return d;
    }
    return null;
  }
  const myDistrict = me ? getDistrict(me.position) : null;

  let desc = card.description;
  if (card.requireSameDistrict) {
    desc += '<br><small style="color:var(--gold)">⚠ Потрібно бути в одному районі з ціллю</small>';
  }

  const buttons = others.map(p => {
    const targetDistrict = getDistrict(p.position);
    const sameDistrict = card.requireSameDistrict
      ? ((myDistrict && targetDistrict && myDistrict === targetDistrict) || (me && me.position === p.position))
      : true;
    const inPrison = p.inPrison > 0 && card.id !== 'bribe_inmates';
    const canTarget = sameDistrict && !inPrison;

    let label = `${p.name} (${p.respectName})`;
    if (!sameDistrict && card.requireSameDistrict) label += ' — інший район';
    if (inPrison) label += " — у в'язниці";

    return {
      text: label,
      action: canTarget ? () => {
        SFX.attack();
        socket.emit('playMafiaCard', { cardId: card.id, targetId: p.id }, (res) => {
          if (res && res.error) {
            handleResult(res);
          } else {
            hideModal();
            showCardPlayFX(card.id, res);
          }
        });
      } : null,
      cls: canTarget ? 'btn-danger' : 'btn-disabled',
      disabled: !canTarget
    };
  }).concat([{ text: 'Скасувати', action: hideModal, cls: 'btn-secondary' }]);

  showModal(`${ICON.gun} ${card.name}`, desc, buttons);
}

// ===== AUCTION (real-time bidding) =====
let auctionTimerInterval = null;

function showAuctionPanel(action, state) {
  hideModal();
  hideCenterPanel();
  const overlay = document.getElementById('auction-overlay');
  if (!overlay) return;
  overlay.classList.add('active');

  const me = state.players.find(p => p.id === myId);
  const hasPassed = action.passed && action.passed.includes(myId);
  const isLeader = action.currentBidderId === myId;
  const nextBid = action.currentBid === 0 ? action.minPrice : action.currentBid + (action.bidStep || 500);
  const canAfford = me && me.money >= nextBid;

  // District color
  const districtColors = {
    trushchoby: '#8b5e3c', ghetto: '#6a6a6a', spalniy: '#5b8c5a', promzona: '#7a7a2a',
    elitnyy: '#c9a84c', turystychnyy: '#2a8bc9', red_light: '#c94c6a', dilovyy: '#4c6ac9'
  };
  const dColor = districtColors[action.districtId] || 'var(--gold)';

  let bidderDisplay = action.currentBidderName
    ? `<span class="auction-bidder-name">${action.currentBidderName}</span>`
    : `<span class="auction-no-bid">Ще немає ставок</span>`;
  const logItems = [];
  if (action.currentBidderName) {
    logItems.push(`<div class="auction-log-entry"><span class="auction-log-badge">Лідер</span><span>${action.currentBidderName} тримає ${action.currentBid}$</span></div>`);
  } else {
    logItems.push(`<div class="auction-log-entry"><span class="auction-log-badge">Старт</span><span>Початкова ціна: ${action.minPrice}$</span></div>`);
  }
  if (Array.isArray(action.passed) && action.passed.length) {
    action.passed.forEach(pid => {
      const playerName = state.players.find(p => p.id === pid)?.name;
      if (playerName) {
        logItems.push(`<div class="auction-log-entry"><span class="auction-log-badge muted">Пас</span><span>${playerName} вийшов з торгів</span></div>`);
      }
    });
  }

  overlay.innerHTML = `
    <div class="auction-container" style="--auction-color: ${dColor}">
      <div class="auction-header">
        <div class="auction-gavel">${ICON.building}</div>
        <h2>АУКЦІОН</h2>
        <div class="auction-business-name">${action.businessName}</div>
      </div>
      <div class="auction-body">
        <div class="auction-stage-copy">
          ${isLeader ? 'Утримуйте лідерство до кінця таймера.' : hasPassed ? 'Ви поза торгами до завершення аукціону.' : canAfford ? `Наступна ставка: ${nextBid}$` : 'Ваш капітал не дозволяє підвищити ставку.'}
        </div>
        <div class="auction-bid-display">
          <div class="auction-label">Поточна ставка</div>
          <div class="auction-amount">${action.currentBid > 0 ? action.currentBid + '$' : action.minPrice + '$ (стартова)'}</div>
          <div class="auction-label">Лідер</div>
          <div class="auction-leader">${bidderDisplay}</div>
        </div>
        <div class="auction-timer-bar">
          <div class="auction-timer-fill" id="auction-timer-fill"></div>
        </div>
        <div class="auction-timer-text" id="auction-timer-text">5с</div>
        <div class="auction-actions">
          <button class="btn btn-auction-raise" id="btn-auction-raise" ${hasPassed || isLeader || !canAfford ? 'disabled' : ''}>
            ${ICON.money} Ставка ${nextBid}$
          </button>
          <button class="btn btn-auction-pass" id="btn-auction-pass" ${hasPassed ? 'disabled' : ''}>
            Пас
          </button>
        </div>
        ${hasPassed ? '<div class="auction-passed-msg">Ви спасували</div>' : ''}
        ${isLeader ? '<div class="auction-leader-msg">Ви лідер ставки!</div>' : ''}
        ${!canAfford && !hasPassed && !isLeader ? '<div class="auction-no-money">Недостатньо коштів</div>' : ''}
      </div>
      <div class="auction-log" id="auction-log">${logItems.join('')}</div>
    </div>
  `;

  const raiseBtn = document.getElementById('btn-auction-raise');
  const passBtn = document.getElementById('btn-auction-pass');

  if (raiseBtn) {
    raiseBtn.addEventListener('click', () => {
      SFX.buy();
      raiseBtn.disabled = true;
      socket.emit('auctionRaise', {}, (res) => {
        if (res && res.error) handleResult(res);
      });
    });
  }
  if (passBtn) {
    passBtn.addEventListener('click', () => {
      SFX.click();
      passBtn.disabled = true;
      socket.emit('auctionPass', {}, (res) => {
        if (res && res.error) handleResult(res);
      });
    });
  }
}

function hideAuctionPanel() {
  const overlay = document.getElementById('auction-overlay');
  if (overlay) overlay.classList.remove('active');
  if (auctionTimerInterval) {
    clearInterval(auctionTimerInterval);
    auctionTimerInterval = null;
  }
}

// Auction socket events
socket.on('auctionUpdate', (data) => {
  // Re-render auction panel if visible
  if (gameState && gameState.pendingAction && gameState.pendingAction.type === 'auction') {
    // Update action data
    gameState.pendingAction.currentBid = data.currentBid;
    gameState.pendingAction.currentBidderId = data.currentBidderId;
    gameState.pendingAction.currentBidderName = data.currentBidderName;
    gameState.pendingAction.passed = data.passed;
    showAuctionPanel(gameState.pendingAction, gameState);
  }
});

socket.on('auctionTimer', (data) => {
  // Start countdown animation
  const fill = document.getElementById('auction-timer-fill');
  const text = document.getElementById('auction-timer-text');
  if (!fill || !text) return;

  let timeLeft = data.timeLeft;
  fill.style.transition = 'none';
  fill.style.width = '100%';
  requestAnimationFrame(() => {
    fill.style.transition = `width ${timeLeft}s linear`;
    fill.style.width = '0%';
  });

  if (auctionTimerInterval) clearInterval(auctionTimerInterval);
  text.textContent = timeLeft + 'с';
  auctionTimerInterval = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) {
      text.textContent = '0с';
      clearInterval(auctionTimerInterval);
      auctionTimerInterval = null;
    } else {
      text.textContent = timeLeft + 'с';
    }
  }, 1000);
});

socket.on('auctionResult', (data) => {
  hideAuctionPanel();
  if (data.winnerId) {
    const isMe = data.winnerId === myId;
    if (isMe) {
      SFX.buy();
      notifySuccess(`Ви виграли аукціон за ${data.businessName || 'бізнес'} за ${data.price || data.amount || 'фінальну ставку'}!`, {
        title: 'Аукціон',
        center: true,
        duration: 3200
      });
    } else {
      const winnerName = gameState?.players?.find(p => p.id === data.winnerId)?.name || data.winnerName || 'Інший гравець';
      notifyUser(`${winnerName} забрав ${data.businessName || 'бізнес'} за ${data.price || data.amount || 'фінальну ставку'}.`, {
        title: 'Аукціон завершено',
        tone: 'info',
        duration: 2800
      });
    }
  } else {
    notifyUser(`Аукціон за ${data.businessName || 'бізнес'} завершився без переможця.`, {
      title: 'Аукціон завершено',
      tone: 'info',
      duration: 2600
    });
  }
});

// ===== ATTACK ALERT =====
function showAttackAlert(data) {
  const overlay = $('#attack-overlay');
  const attacker = gameState.players.find(p => p.id === data.attackerId);
  const attackerName = attacker ? attacker.name : '???';

  $('#attack-title').textContent = '☠ ЗАМАХ!';
  $('#attack-desc').textContent = `${attackerName} використовує "${data.card.name}" проти вас!`;

  const timerBar = document.createElement('div');
  timerBar.className = 'attack-timer-bar';
  timerBar.style.width = '100%';
  $('#attack-timer').innerHTML = '';
  $('#attack-timer').appendChild(timerBar);

  const timeLimit = data.timeLimit || 12000;
  const startTime = Date.now();
  if (attackTimer) clearInterval(attackTimer);
  attackTimer = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const pct = Math.max(0, 100 - (elapsed / timeLimit * 100));
    timerBar.style.width = pct + '%';
    if (pct <= 0) {
      clearInterval(attackTimer);
      socket.emit('resolveAction', { actionType: 'attack_reaction', data: { reaction: 'none' } }, handleResult);
      hideAttackAlert();
    }
  }, 100);

  const reactions = $('#attack-reactions');
  reactions.innerHTML = '';

  if (data.canVest) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.innerHTML = `${ICON.shield} Бронежилет`;
    btn.addEventListener('click', () => {
      clearInterval(attackTimer);
      SFX.click();
      socket.emit('resolveAction', { actionType: 'attack_reaction', data: { reaction: 'vest' } }, handleResult);
      hideAttackAlert();
    });
    reactions.appendChild(btn);
  }

  if (data.canPolice) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.innerHTML = `${ICON.police} Поліція`;
    btn.addEventListener('click', () => {
      clearInterval(attackTimer);
      SFX.prisonDoor();
      socket.emit('resolveAction', { actionType: 'attack_reaction', data: { reaction: 'police' } }, handleResult);
      hideAttackAlert();
    });
    reactions.appendChild(btn);
  }

  if (data.canBuyOff) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary';
    btn.innerHTML = `${ICON.money} Відкупитись (${data.buyOffCost}$)`;
    btn.addEventListener('click', () => {
      clearInterval(attackTimer);
      SFX.payRent();
      socket.emit('resolveAction', { actionType: 'attack_reaction', data: { reaction: 'buyoff' } }, handleResult);
      hideAttackAlert();
    });
    reactions.appendChild(btn);
  }

  const noBtn = document.createElement('button');
  noBtn.className = 'btn btn-danger';
  noBtn.textContent = '❌ Нічого не робити';
  noBtn.addEventListener('click', () => {
    clearInterval(attackTimer);
    socket.emit('resolveAction', { actionType: 'attack_reaction', data: { reaction: 'none' } }, handleResult);
    hideAttackAlert();
  });
  reactions.appendChild(noBtn);

  overlay.classList.add('active');
}

function hideAttackAlert() {
  if (attackTimer) clearInterval(attackTimer);
  $('#attack-overlay').classList.remove('active');
}

function showAttackNotification(data) {
  const attacker = gameState.players.find(p => p.id === data.attackerId);
  const target = gameState.players.find(p => p.id === data.targetId);
  if (!attacker || !target) return;
  showEventDisplay(`
    <h3>☠ ЗАМАХ!</h3>
    <p>${attacker.name} → ${data.card.name} → ${target.name}</p>
  `, 4000);
}

// ===== CASINO =====
function showCasino() {
  SFX.casino();
  hideCenterPanel();
  hideModal();
  const overlay = $('#casino-overlay');
  overlay.classList.add('active');
  selectedBetType = null;
  $('#casino-result').textContent = '';
  $('#casino-result').className = 'casino-result';
  $('#btn-casino-close').style.display = 'none';
  $('#btn-spin').disabled = false;

  // Reset wheel
  const wheel = $('#roulette-wheel');
  wheel.style.transition = 'none';
  wheel.style.transform = 'rotate(0deg)';
  wheel.classList.remove('spinning');
  setTimeout(() => { wheel.style.transition = 'transform 4s cubic-bezier(0.15,0.75,0.25,1)'; }, 50);

  const bets = $('#casino-bets');
  bets.innerHTML = '';
  const betTypes = [
    { id: 'red', label: `${ICON.circle_red} ЧЕРВОНЕ`, cls: 'red' },
    { id: 'black', label: `${ICON.circle_black} ЧОРНЕ`, cls: 'black' }
  ];
  for (const bt of betTypes) {
    const el = document.createElement('div');
    el.className = `casino-bet ${bt.cls}`;
    el.innerHTML = bt.label;
    el.addEventListener('click', () => {
      SFX.click();
      $$('.casino-bet').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
      selectedBetType = bt.id;
    });
    bets.appendChild(el);
  }

  // Jackpot hint
  $('#casino-jackpot-hint').innerHTML = `${ICON.crown} Зелений сектор = MAFIA JACKPOT`;

  const slider = $('#bet-amount');
  const display = $('#bet-display');
  slider.value = 500;
  display.textContent = '500$';
  slider.oninput = () => { display.textContent = slider.value + '$'; };
}

$('#btn-spin').addEventListener('click', () => {
  if (!selectedBetType) return notifyError('Оберіть тип ставки!', { title: 'Казино' });
  const betAmount = parseInt($('#bet-amount').value);
  $('#btn-spin').disabled = true;
  SFX.casino();

  const wheel = $('#roulette-wheel');
  wheel.classList.add('spinning');

  // Safety: if callback never fires (disconnect, network error), unfreeze wheel after 20s
  const casinoSafetyTimer = setTimeout(() => {
    wheel.classList.remove('spinning');
    const resultEl = $('#casino-result');
    if (resultEl) { resultEl.textContent = 'Втрата зв’язку. Спробуйте ще раз.'; resultEl.className = 'casino-result lose'; }
    const spinBtn = $('#btn-spin');
    if (spinBtn) spinBtn.disabled = false;
  }, 20000);

  socket.emit('resolveAction', {
    actionType: 'casino',
    data: { betType: selectedBetType, betAmount }
  }, (res) => {
    clearTimeout(casinoSafetyTimer);
    if (res.error) {
      wheel.classList.remove('spinning');
      const resultEl = $('#casino-result');
      resultEl.textContent = res.error;
      resultEl.className = 'casino-result lose';
      $('#btn-spin').disabled = false;
      return;
    }

    // 12 sectors, each 30deg. Sectors: red,black,red,black,red,green,black,red,black,red,black,green
    const sectorIndex = res.sectorIndex !== undefined ? res.sectorIndex : 0;
    const sectorAngle = 30; // 360 / 12
    // Land marker on the middle of the target sector
    // Sector 0 starts at 0deg (top). Marker is at top, wheel rotates clockwise.
    // To point at sector N: rotate wheel so sector N's center aligns with top
    // Sector N occupies [N*30, (N+1)*30] degrees in the conic-gradient (clockwise from top).
    // Wheel rotates clockwise (positive deg). To land marker (top) on sector N's center,
    // we need totalRotation mod 360 = 360 - targetCenter (so that sector aligns with top).
    const targetCenter = sectorIndex * sectorAngle + sectorAngle / 2;
    const jitter = (Math.random() - 0.5) * 16;
    const fullSpins = (5 + Math.floor(Math.random() * 3)) * 360; // must be multiple of 360
    const finalRotation = fullSpins + (360 - targetCenter) + jitter;
    wheel.style.transform = `rotate(${finalRotation}deg)`;

    const colorNames = { red: 'Червоне', black: 'Чорне', green: 'Зелене' };

    setTimeout(() => {
      wheel.classList.remove('spinning');
      const resultEl = $('#casino-result');
      const sectorColor = res.sectorColor || 'red';
      const colorName = colorNames[sectorColor] || sectorColor;

      if (res.type === 'jackpot') {
        SFX.jackpot();
        resultEl.innerHTML = `${ICON.crown} MAFIA JACKPOT! ${ICON.crown}<br><small style="color:var(--green-light)">Зелений сектор — оберіть бізнес безкоштовно!</small>`;
        resultEl.className = 'casino-result jackpot';
      } else if (res.won) {
        SFX.win();
        resultEl.innerHTML = `${colorName} — Виграш +${res.winnings}$`;
        resultEl.className = 'casino-result win';
      } else {
        SFX.lose();
        resultEl.innerHTML = `${colorName} — Програш -${res.lost}$`;
        resultEl.className = 'casino-result lose';
      }
      $('#btn-casino-close').style.display = 'inline-block';
    }, 4200);
  });
});

$('#btn-casino-close').addEventListener('click', () => {
  SFX.click();
  $('#casino-overlay').classList.remove('active');
  const wheel = $('#roulette-wheel');
  wheel.style.transition = 'none';
  wheel.style.transform = 'rotate(0deg)';
  wheel.classList.remove('spinning');
  setTimeout(() => { wheel.style.transition = 'transform 4s cubic-bezier(0.15, 0.75, 0.25, 1)'; }, 50);
});

// ===== LOG =====
function renderLog(state) {
  const container = $('#log-entries');
  container.innerHTML = '';
  const entries = (state.log || []).slice(-20).reverse();
  for (const entry of entries) {
    const el = document.createElement('div');
    el.className = 'log-entry';
    el.textContent = entry.message;
    container.appendChild(el);
  }
}

// ===== SURRENDER (topbar, double-click) =====
$('#btn-surrender').addEventListener('dblclick', () => {
  SFX.click();
  if (confirm('Ви впевнені, що хочете здатися? Ця дія незворотна!')) {
    socket.emit('surrender', {}, handleResult);
  }
});
$('#btn-surrender').addEventListener('click', () => {
  // Single click shows a hint, does nothing
});

// ===== LEAVE GAME =====
$('#btn-leave').addEventListener('click', () => {
  SFX.click();
  if (confirm('Вийти з гри? Ви втратите прогрес!')) {
    socket.emit('leaveGame', {});
    location.reload();
  }
});

// ===== RESTART MATCH =====
$('#btn-restart').addEventListener('click', () => {
  SFX.click();
  if (confirm('Перезапустити матч? Всі гравці повернуться в лобі кімнати.')) {
    socket.emit('restartGame', {}, (res) => {
      if (res.error) showError(res.error);
    });
  }
});

socket.on('gameRestarted', () => {
  try { hideModal(); } catch (e) {}
  try { hideCenterPanel(); } catch (e) {}
  try {
    const reveal = document.getElementById('card-reveal');
    if (reveal) reveal.classList.remove('active');
  } catch (e) {}
  document.querySelectorAll('.hidden-helper-overlay, .bomb-picker-overlay, .trade-overlay').forEach(el => el.remove());
  notifyInfo('Матч перезапущено. Ви повернулися в лобі кімнати.', { title: 'Перезапуск матчу' });
});

// ===== FULLSCREEN =====
$('#btn-fullscreen').addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});

// ===== MOBILE PANEL TOGGLE =====
$('#btn-toggle-panel').addEventListener('click', () => {
  SFX.click();
  const panel = $('.right-panel');
  panel.classList.toggle('expanded');
});

// ===== RULES =====
function openRules() {
  SFX.click();
  $('#rules-overlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeRules() {
  SFX.click();
  $('#rules-overlay').classList.remove('active');
  document.body.style.overflow = '';
}
$('#btn-rules').addEventListener('click', openRules);
$('#btn-rules-lobby').addEventListener('click', openRules);
$('#btn-rules-close').addEventListener('click', closeRules);
// Close rules on overlay click (outside container)
$('#rules-overlay').addEventListener('click', (e) => {
  if (e.target === $('#rules-overlay')) {
    closeRules();
  }
});
// ESC to close rules
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('#rules-overlay').classList.contains('active')) {
    closeRules();
  }
});
// Collapsible sections
document.querySelectorAll('.rule-collapse-header').forEach(header => {
  header.addEventListener('click', () => {
    const targetId = header.getAttribute('data-target');
    const body = document.getElementById(targetId);
    if (!body) return;
    const isOpen = !body.classList.contains('closed');
    if (isOpen) {
      body.classList.add('closed');
      body.classList.remove('open');
      header.classList.add('collapsed');
    } else {
      body.classList.remove('closed');
      body.classList.add('open');
      header.classList.remove('collapsed');
    }
  });
});
// Smooth scroll for nav links inside rules
document.querySelectorAll('.rules-nav-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.querySelector(link.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Open section if collapsed
      const header = target.querySelector('.rule-collapse-header');
      const body = target.querySelector('.rule-collapse-body');
      if (header && body && body.classList.contains('closed')) {
        body.classList.remove('closed');
        body.classList.add('open');
        header.classList.remove('collapsed');
      }
    }
  });
});

// ===== CHAT SYSTEM =====
let chatOpen = false;
let chatUnread = 0;
let chatMessages = [];

function initChat() {
  const chatToggle = document.getElementById('chat-toggle');
  const chatPanel = document.getElementById('chat-panel');
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');
  if (!chatToggle || !chatPanel) return;

  chatToggle.addEventListener('click', () => {
    chatOpen = !chatOpen;
    chatPanel.classList.toggle('open', chatOpen);
    chatToggle.classList.toggle('active', chatOpen);
    if (chatOpen) {
      chatUnread = 0;
      updateChatBadge();
      chatInput?.focus();
      scrollChatToBottom();
    }
  });

  if (chatSend) chatSend.addEventListener('click', sendChatMessage);
  if (chatInput) chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });

  // Quick emoji buttons
  document.querySelectorAll('.chat-emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      socket.emit('chatReaction', { emoji: btn.dataset.emoji });
    });
  });

  // Load chat history
  socket.emit('getChatHistory', {}, (history) => {
    chatMessages = history || [];
    renderChatMessages();
  });
}

function sendChatMessage() {
  const input = document.getElementById('chat-input');
  if (!input || !input.value.trim()) return;
  socket.emit('chatMessage', { message: input.value.trim() });
  input.value = '';
}

function renderChatMessages() {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  container.innerHTML = '';
  for (const msg of chatMessages.slice(-100)) {
    const div = document.createElement('div');
    div.className = 'chat-msg';
    const time = new Date(msg.timestamp);
    div.innerHTML = `
      <span class="chat-msg-name" style="color:${msg.playerColor}">${msg.playerName}</span>
      <span class="chat-msg-time">${time.getHours().toString().padStart(2,'0')}:${time.getMinutes().toString().padStart(2,'0')}</span>
      <div class="chat-msg-text">${escapeHtml(msg.message)}</div>
    `;
    container.appendChild(div);
  }
  scrollChatToBottom();
}

function scrollChatToBottom() {
  const container = document.getElementById('chat-messages');
  if (container) container.scrollTop = container.scrollHeight;
}

function updateChatBadge() {
  const badge = document.getElementById('chat-badge');
  if (badge) {
    badge.textContent = chatUnread;
    badge.style.display = chatUnread > 0 ? 'flex' : 'none';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

socket.on('chatMessage', (msg) => {
  chatMessages.push(msg);
  if (chatMessages.length > 100) chatMessages.shift();
  renderChatMessages();
  if (!chatOpen) {
    chatUnread++;
    updateChatBadge();
  }
});

socket.on('chatReaction', (data) => {
  // Show floating emoji near player panel
  showFloatingEmoji(data.playerId, data.emoji);
});

function showFloatingEmoji(playerId, emoji) {
  const panels = document.querySelectorAll('.player-panel');
  const state = gameState;
  if (!state) return;
  const idx = state.players.findIndex(p => p.id === playerId);
  if (idx < 0 || !panels[idx]) return;
  const el = document.createElement('div');
  el.className = 'floating-emoji';
  el.textContent = emoji;
  panels[idx].style.position = 'relative';
  panels[idx].appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

// ===== TURN TIMER =====
let turnTimerRemaining = 0;

socket.on('turnTimer', ({ remaining }) => {
  turnTimerRemaining = remaining;
  renderTurnTimer(remaining);
  // Play tick sound when < 10s and it's my turn
  if (remaining <= 10 && remaining > 0 && gameState?.currentPlayerId === myId) {
    playTone(800 + (10 - remaining) * 50, 0.05, 'sine', 0.04);
  }
});

function renderTurnTimer(remaining) {
  let timerEl = document.getElementById('turn-timer');
  if (!timerEl) return;
  if (remaining <= 0) {
    timerEl.style.display = 'none';
    return;
  }
  timerEl.style.display = 'flex';
  const pct = remaining / 60;
  const color = remaining > 30 ? '#2ecc71' : remaining > 10 ? '#f39c12' : '#e74c3c';
  const circumference = 2 * Math.PI * 18;
  const offset = circumference * (1 - pct);
  timerEl.innerHTML = `
    <svg width="44" height="44" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="3"/>
      <circle cx="22" cy="22" r="18" fill="none" stroke="${color}" stroke-width="3"
        stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
        transform="rotate(-90 22 22)" stroke-linecap="round"
        style="transition: stroke-dashoffset 1s linear, stroke 0.5s;"/>
    </svg>
    <span class="timer-text" style="color:${color}">${remaining}</span>
  `;
  if (remaining <= 10) timerEl.classList.add('timer-critical');
  else timerEl.classList.remove('timer-critical');
}

// ===== AMBIENT MUSIC =====
let musicPlaying = false;
let musicNodes = null;

function startAmbientMusic() {
  if (musicPlaying || !audioCtx) return;
  ensureAudio();
  const t = audioCtx.currentTime;
  const master = audioCtx.createGain();
  master.gain.setValueAtTime(0, t);
  master.gain.linearRampToValueAtTime(0.05, t + 3);
  master.connect(audioCtx.destination);

  // --- Deep bass with slow LFO vibrato ---
  const bass = audioCtx.createOscillator();
  bass.type = 'sine';
  bass.frequency.value = 55;
  const bassGain = audioCtx.createGain();
  bassGain.gain.value = 0.4;
  const bassLfo = audioCtx.createOscillator();
  bassLfo.type = 'sine';
  bassLfo.frequency.value = 0.15;
  const bassLfoGain = audioCtx.createGain();
  bassLfoGain.gain.value = 2;
  bassLfo.connect(bassLfoGain);
  bassLfoGain.connect(bass.frequency);
  bassLfo.start();
  // Sub-bass layer
  const sub = audioCtx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = 27.5;
  const subGain = audioCtx.createGain();
  subGain.gain.value = 0.25;
  sub.connect(subGain);
  subGain.connect(master);
  sub.start();
  bass.connect(bassGain);
  bassGain.connect(master);
  bass.start();

  // --- String-like pad with filter sweep ---
  const chords = [
    [220, 261.6, 329.6, 440],    // Am
    [174.6, 220, 261.6, 349.2],  // Dm/F
    [164.8, 207.7, 246.9, 329.6],// E7
    [220, 261.6, 329.6, 440],    // Am
    [196, 246.9, 293.7, 392],    // G
    [174.6, 220, 261.6, 349.2],  // Dm/F
    [164.8, 207.7, 311.1, 415.3],// E7(#5)
    [220, 261.6, 329.6, 440]     // Am
  ];
  let chordIdx = 0;
  const padOscs = [];
  const padFilters = [];
  for (let i = 0; i < 4; i++) {
    const osc1 = audioCtx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = chords[0][i];
    const osc2 = audioCtx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = chords[0][i] * 1.003; // slight detune for warmth
    const g = audioCtx.createGain();
    g.gain.value = 0.03;
    const filt = audioCtx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 300;
    filt.Q.value = 1.5;
    osc1.connect(filt);
    osc2.connect(filt);
    filt.connect(g);
    g.connect(master);
    osc1.start();
    osc2.start();
    padOscs.push(osc1, osc2);
    padFilters.push(filt);
  }

  // Filter sweep LFO for pads
  const padSweepLfo = audioCtx.createOscillator();
  padSweepLfo.type = 'sine';
  padSweepLfo.frequency.value = 0.08;
  const padSweepGain = audioCtx.createGain();
  padSweepGain.gain.value = 200;
  padSweepLfo.connect(padSweepGain);
  padFilters.forEach(f => padSweepGain.connect(f.frequency));
  padSweepLfo.start();

  // Chord progression — slower, cinematic
  const chordInterval = setInterval(() => {
    chordIdx = (chordIdx + 1) % chords.length;
    for (let i = 0; i < 4; i++) {
      const freq = chords[chordIdx][i];
      padOscs[i * 2].frequency.linearRampToValueAtTime(freq, audioCtx.currentTime + 3);
      padOscs[i * 2 + 1].frequency.linearRampToValueAtTime(freq * 1.003, audioCtx.currentTime + 3);
    }
    // Bass follows root
    bass.frequency.linearRampToValueAtTime(chords[chordIdx][0] / 4, audioCtx.currentTime + 2);
  }, 6000);

  // --- Piano-like plucks (random arpeggiated notes) ---
  const pianoNotes = [220, 261.6, 293.7, 329.6, 349.2, 392, 440, 523.3];
  const pianoInterval = setInterval(() => {
    try {
      if (Math.random() > 0.6) return; // skip some beats for breathing room
      const freq = pianoNotes[Math.floor(Math.random() * pianoNotes.length)];
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      // Harmonic overtone
      const osc2 = audioCtx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = freq * 2;
      const g = audioCtx.createGain();
      const now = audioCtx.currentTime;
      g.gain.setValueAtTime(0.06, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
      const g2 = audioCtx.createGain();
      g2.gain.setValueAtTime(0.015, now);
      g2.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      const filt = audioCtx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(2000, now);
      filt.frequency.exponentialRampToValueAtTime(400, now + 2);
      osc.connect(filt);
      osc2.connect(g2);
      filt.connect(g);
      g.connect(master);
      g2.connect(master);
      osc.start(now);
      osc2.start(now);
      osc.stop(now + 3);
      osc2.stop(now + 1.5);
    } catch(e) {}
  }, 2500);

  // --- Soft tick rhythm (like a distant clock) ---
  const tickInterval = setInterval(() => {
    try {
      const bufLen = audioCtx.sampleRate * 0.02;
      const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audioCtx.sampleRate * 0.004));
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      const g = audioCtx.createGain();
      g.gain.value = 0.015;
      const filt = audioCtx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = 800;
      filt.Q.value = 5;
      src.connect(filt);
      filt.connect(g);
      g.connect(master);
      src.start();
    } catch(e) {}
  }, 3000);

  musicPlaying = true;
  musicNodes = { master, bass, bassGain, sub, subGain, bassLfo, padOscs, padFilters, padSweepLfo, chordInterval, pianoInterval, tickInterval };
}

function stopAmbientMusic() {
  if (!musicPlaying || !musicNodes) return;
  const { master, bass, sub, bassLfo, padOscs, padSweepLfo, chordInterval, pianoInterval, tickInterval } = musicNodes;
  master.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 2);
  clearInterval(chordInterval);
  clearInterval(pianoInterval);
  clearInterval(tickInterval);
  setTimeout(() => {
    [bass, sub, bassLfo, padSweepLfo, ...padOscs].forEach(o => { try { o.stop(); } catch(e) {} });
  }, 2500);
  musicPlaying = false;
  musicNodes = null;
}

function toggleMusic() {
  if (musicPlaying) { stopAmbientMusic(); localStorage.setItem('mafia_music', 'off'); }
  else { startAmbientMusic(); localStorage.setItem('mafia_music', 'on'); }
  updateMusicButton();
}

function updateMusicButton() {
  const btn = document.getElementById('btn-music');
  if (btn) btn.innerHTML = musicPlaying ? ICON.music_on : ICON.music_off;
}

// ===== ENHANCED VICTORY SCREEN =====
let _victoryDismissed = false;
function showEnhancedVictoryScreen(state) {
  if (state.phase !== 'finished') return;
  if (_victoryDismissed) return; // user closed it, don't re-show
  let winner = null;
  if (state.winner) winner = state.players.find(p => p.id === state.winner.id);
  if (!winner) {
    const alive = state.players.filter(p => p.alive);
    winner = alive.length === 1 ? alive[0] : (alive.length > 0 ? alive.reduce((a,b) => a.money > b.money ? a : b) : state.players.reduce((a,b) => a.money > b.money ? a : b));
  }
  if (!winner) return;

  SFX.epicVictory();
  const overlay = document.getElementById('victory-overlay');
  document.getElementById('victory-name').textContent = winner.name;
  const winnerStats = winner.stats || {};
  const businessCount = winner.businessCount || (winner.businesses || []).length || 0;
  const summaryEl = document.getElementById('victory-summary');
  if (summaryEl) {
    const summaryBits = [
      `${ICON.money} ${winner.money}$`,
      `${ICON.building} ${businessCount} бізнесів`,
      `${ICON.crown} Повага ${winner.respectLevel || 1}`
    ];
    if ((winnerStats.attacksMade || 0) > 0) summaryBits.push(`${ICON.swords} ${winnerStats.attacksMade} атак`);
    if (((winnerStats.casinoWins || 0) + (winnerStats.casinoLosses || 0)) > 0) {
      summaryBits.push(`${ICON.casino_chip} ${(winnerStats.casinoWins || 0)}W/${(winnerStats.casinoLosses || 0)}L`);
    }
    summaryEl.innerHTML = summaryBits.map(bit => `<span>${bit}</span>`).join('');
  }

  // Build stats for all players, ranked — winner always first
  const ranked = [...state.players].sort((a, b) => {
    if (a.id === winner.id) return -1;
    if (b.id === winner.id) return 1;
    if (a.alive !== b.alive) return b.alive ? 1 : -1;
    let aWealth = a.money + (a.businesses || []).length * 2000;
    let bWealth = b.money + (b.businesses || []).length * 2000;
    return bWealth - aWealth;
  });

  let statsHtml = '<div class="victory-leaderboard">';
  ranked.forEach((p, i) => {
    const isWinner = p.id === winner.id;
    const medal = i === 0 ? ICON.medal_gold : i === 1 ? ICON.medal_silver : i === 2 ? ICON.medal_bronze : `#${i+1}`;
    const s = p.stats || {};
    statsHtml += `
      <div class="vl-row ${isWinner ? 'vl-winner' : ''} ${!p.alive ? 'vl-dead' : ''}">
        <span class="vl-rank">${medal}</span>
        <span class="vl-avatar ${p.character?.id && PORTRAITS[p.character.id] ? 'avatar-portrait' : ''}" style="${p.character?.id && PORTRAITS[p.character.id] ? `--char-color:${p.character.color}` : `background:${p.character?.color || '#888'}`}">${p.character?.id && PORTRAITS[p.character.id] ? PORTRAITS[p.character.id] : p.name[0]}</span>
        <div class="vl-info">
          <div class="vl-name">${p.name} ${!p.alive ? '☠' : ''}</div>
          <div class="vl-stats-row">
            <span>${ICON.money} ${p.money}$</span>
            <span>${ICON.building} ${p.businessCount || 0}</span>
            <span>${ICON.cards} ${s.mafiaCardsUsed || 0}</span>
            <span>${ICON.swords} ${s.attacksMade || 0}</span>
            <span>${ICON.casino_chip} ${(s.casinoWins||0)}W/${(s.casinoLosses||0)}L</span>
          </div>
        </div>
      </div>
    `;
  });
  statsHtml += '</div>';
  document.getElementById('victory-stats').innerHTML = statsHtml;

  // Particles
  const particlesContainer = document.getElementById('victory-particles');
  if (particlesContainer) {
    particlesContainer.innerHTML = '';
    const colors = ['#c9a84c', '#e8c95a', '#f0d060', '#fff', '#8a6d1b', '#e74c3c', '#3498db', '#2ecc71'];
    for (let i = 0; i < 80; i++) {
      const p = document.createElement('div');
      p.className = 'victory-particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.animationDuration = (3 + Math.random() * 4) + 's';
      p.style.animationDelay = (Math.random() * 5) + 's';
      particlesContainer.appendChild(p);
    }
  }
  overlay.classList.add('active');

  // Close button — hide overlay without losing session (for spectating after game)
  const closeBtn = document.getElementById('victory-close');
  if (closeBtn) {
    closeBtn.onclick = () => {
      overlay.classList.remove('active');
      _victoryDismissed = true;
      // Clear rejoin session so F5 doesn't put us back in the finished game
      try {
        sessionStorage.removeItem('mafia_roomId');
        sessionStorage.removeItem('mafia_playerName');
        sessionStorage.removeItem('mafia_rejoinToken');
      } catch(e) {}
    };
  }
}

// ===== TRADING UI =====
function showTradeUI(targetPlayer) {
  const state = gameState;
  if (!state) return;
  const me = state.players.find(p => p.id === myId);
  if (!me) return;

  const overlay = document.createElement('div');
  overlay.className = 'trade-overlay active';
  let myBizHtml = (me.businesses || []).map(bizId => {
    const dist = state.districts.find(d => d.businesses.some(b => b.id === bizId));
    const biz = dist?.businesses.find(b => b.id === bizId);
    return `<label class="trade-biz-label"><input type="checkbox" value="${bizId}" class="trade-give-biz"> ${biz?.name || bizId}</label>`;
  }).join('');
  let theirBizHtml = (targetPlayer.businesses || []).map(bizId => {
    const dist = state.districts.find(d => d.businesses.some(b => b.id === bizId));
    const biz = dist?.businesses.find(b => b.id === bizId);
    return `<label class="trade-biz-label"><input type="checkbox" value="${bizId}" class="trade-want-biz"> ${biz?.name || bizId}</label>`;
  }).join('');

  overlay.innerHTML = `
    <div class="trade-modal">
      <h3>Угода з ${targetPlayer.name}</h3>
      <div class="trade-columns">
        <div class="trade-col">
          <h4>Ви даєте</h4>
          <label>Гроші: <input type="number" id="trade-give-money" value="0" min="0" max="${me.money}" step="500"></label>
          <div class="trade-biz-list">${myBizHtml || '<span style="color:#666">Немає бізнесів</span>'}</div>
        </div>
        <div class="trade-col">
          <h4>Ви отримуєте</h4>
          <label>Гроші: <input type="number" id="trade-want-money" value="0" min="0" max="${targetPlayer.money}" step="500"></label>
          <div class="trade-biz-list">${theirBizHtml || '<span style="color:#666">Немає бізнесів</span>'}</div>
        </div>
      </div>
      <div class="trade-actions">
        <button class="btn btn-primary" id="trade-send">Запропонувати</button>
        <button class="btn btn-secondary" id="trade-cancel">Скасувати</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#trade-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#trade-send').addEventListener('click', () => {
    const giveMoney = parseInt(document.getElementById('trade-give-money').value) || 0;
    const wantMoney = parseInt(document.getElementById('trade-want-money').value) || 0;
    const giveBusiness = [...overlay.querySelectorAll('.trade-give-biz:checked')].map(c => c.value);
    const wantBusiness = [...overlay.querySelectorAll('.trade-want-biz:checked')].map(c => c.value);
    socket.emit('tradeOffer', { toId: targetPlayer.id, offer: { giveMoney, wantMoney, giveBusiness, wantBusiness } }, (res) => {
      if (res.error) notifyError(res.error, { title: 'Угода' });
      else notifySuccess('Пропозицію відправлено!', { title: 'Угода' });
      overlay.remove();
    });
  });
}

// ===== ALLIANCE UI =====
function showAllianceUI(targetPlayer) {
  showCenterPanel(`Альянс з ${targetPlayer.name}`, 'Запропонувати мирний альянс? (3 кола без атак)', [
    { text: 'Запропонувати (3 кола)', action: () => {
      socket.emit('allianceOffer', { toId: targetPlayer.id, rounds: 3 }, (res) => {
        if (res.error) notifyError(res.error, { title: 'Альянс' });
        else notifySuccess('Пропозицію альянсу відправлено!', { title: 'Альянс' });
      });
      hideCenterPanel();
    }},
    { text: 'Скасувати', action: hideCenterPanel, cls: 'btn-secondary' }
  ]);
}

// ===== RECONNECT =====
(function initReconnect() {
  if (isTVMode || isPhoneMode) return; // TV/Phone handle their own reconnection
  // Store session info
  socket.on('connect', () => {
    const savedRoom = sessionStorage.getItem('mafia_roomId');
    const savedName = sessionStorage.getItem('mafia_playerName');
    const savedToken = sessionStorage.getItem('mafia_rejoinToken');
    if (savedRoom && savedName && savedToken && !myRoomId) {
      socket.emit('rejoinRoom', { roomId: savedRoom, playerName: savedName, rejoinToken: savedToken }, (res) => {
        if (res.success) {
          myId = res.playerId;
          myRoomId = res.roomId;
          showScreen(gameScreen);
        } else {
          sessionStorage.removeItem('mafia_roomId');
          sessionStorage.removeItem('mafia_playerName');
          sessionStorage.removeItem('mafia_rejoinToken');
        }
      });
    }
  });

  // Save session on join
  const origCreateCb = socket.listeners('createRoom');
  // Intercept gameState to save session
  socket.on('gameState', (state) => {
    if (myRoomId && state.phase !== 'waiting') {
      sessionStorage.setItem('mafia_roomId', myRoomId);
      const me = state.players.find(p => p.id === myId);
      if (me) sessionStorage.setItem('mafia_playerName', me.name);
    }
  });
})();

// ===== INIT NEW FEATURES =====
document.addEventListener('DOMContentLoaded', () => {
  // If TV or Phone mode, hide default lobby immediately
  if (isTVMode || isPhoneMode) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    if (isTVMode) $('#tv-screen').classList.add('active');
    if (isPhoneMode) $('#phone-screen').classList.add('active');
  }

  if (!isTVMode && !isPhoneMode) initChat();
  // Music auto-start preference
  if (localStorage.getItem('mafia_music') === 'on') {
    document.addEventListener('click', function musicAutoStart() {
      ensureAudio();
      startAmbientMusic();
      updateMusicButton();
      document.removeEventListener('click', musicAutoStart);
    }, { once: true });
  }
  // Music toggle button
  const musicBtn = document.getElementById('btn-music');
  if (musicBtn) musicBtn.addEventListener('click', toggleMusic);
});

// Handle new mafia card clicks (informer, tax_collector, sabotage, etc.)
const _origOnMafiaCardClick = onMafiaCardClick;

// Override onMafiaCardClick to handle new cards
function onMafiaCardClickExtended(card, state) {
  const isMyTurn = state.currentPlayerId === myId;
  if (!isMyTurn || state.turnPhase !== 'action') return;
  if (card.type === 'attack' && state.currentRound < state.mafiaCardMinRound) {
    showEventDisplay(`<p style="color:var(--red-light)">${ICON.lock} Карти атаки доступні з ${state.mafiaCardMinRound}-го кола!</p>`, 2500);
    return;
  }
  SFX.mafia();

  // New cards
  if (card.id === 'double_agent' || card.id === 'blackmail') {
    showTargetSelectionModal(card, state);
    return;
  }
  if (card.id === 'tax_collector') {
    socket.emit('playMafiaCard', { cardId: 'tax_collector' }, (r) => handleCardResult('tax_collector', r));
    return;
  }
  if (card.id === 'sabotage') {
    // Show business selection for sabotage
    const othersBiz = [];
    for (const p of state.players) {
      if (p.id === myId || !p.alive) continue;
      for (const bizId of (p.businesses || [])) {
        const bs = state.businesses[bizId];
        if (bs && (bs.influenceLevel || 0) > 0) {
          const dist = state.districts.find(d => d.businesses.some(b => b.id === bizId));
          const biz = dist?.businesses.find(b => b.id === bizId);
          othersBiz.push({ text: `${biz?.name || bizId} (${p.name}) ★${bs.influenceLevel}`, bizId });
        }
      }
    }
    if (othersBiz.length === 0) {
      showEventDisplay('<p style="color:var(--red-light)">Немає бізнесів з впливом для саботажу.</p>', 2500);
      return;
    }
    showCenterPanel('Саботаж', 'Оберіть бізнес для знищення впливу:', othersBiz.map(b => ({
      text: b.text,
      action: () => {
        socket.emit('playMafiaCard', { cardId: 'sabotage', options: { businessId: b.bizId } },
          (r) => handleCardResult('sabotage', r));
        hideCenterPanel();
      }
    })).concat([{ text: 'Скасувати', action: hideCenterPanel, cls: 'btn-secondary' }]));
    return;
  }
  if (card.id === 'witness_protection') {
    socket.emit('playMafiaCard', { cardId: 'witness_protection' }, (r) => handleCardResult('witness_protection', r));
    return;
  }
  if (card.id === 'insurance') {
    socket.emit('playMafiaCard', { cardId: 'insurance' }, (r) => handleCardResult('insurance', r));
    return;
  }
  // --- Wave 2 cards ---
  if (card.id === 'corruption') {
    socket.emit('playMafiaCard', { cardId: 'corruption' }, (r) => handleCardResult('corruption', r));
    return;
  }
  if (card.id === 'money_laundering') {
    socket.emit('playMafiaCard', { cardId: 'money_laundering' }, (r) => handleCardResult('money_laundering', r));
    return;
  }
  if (card.id === 'hostile_takeover') {
    // Show business selection for hostile takeover (1.5x biz price)
    const htBiz = [];
    for (const p of state.players) {
      if (p.id === myId || !p.alive) continue;
      for (const bizId of (p.businesses || [])) {
        const dist = state.districts.find(d => d.businesses.some(b => b.id === bizId));
        const biz = dist?.businesses.find(b => b.id === bizId);
        if (biz) {
          htBiz.push({ text: `${biz.name} (${p.name}) — ${Math.round(biz.price * 1.5)}$`, bizId });
        }
      }
    }
    if (htBiz.length === 0) {
      showEventDisplay('<p style="color:var(--red-light)">Немає бізнесів для поглинання.</p>', 2500);
      return;
    }
    showCenterPanel(`${ICON.building} Вороже поглинання`, 'Оберіть бізнес для примусової покупки:', htBiz.map(b => ({
      text: b.text,
      action: () => {
        socket.emit('playMafiaCard', { cardId: 'hostile_takeover', options: { businessId: b.bizId } },
          (r) => handleCardResult('hostile_takeover', r));
        hideCenterPanel();
      }
    })).concat([{ text: 'Скасувати', action: hideCenterPanel, cls: 'btn-secondary' }]));
    return;
  }

  // Fall through to original handler for existing cards
  if (card.type === 'attack' || card.id === 'rumors' || card.id === 'kompromat') {
    showTargetSelectionModal(card, state);
  } else if (card.id === 'bomb') {
    showBombSectorPicker();
  } else if (card.id === 'lawyer') {
    socket.emit('playMafiaCard', { cardId: 'lawyer' }, (r) => handleCardResult('lawyer', r));
  } else if (card.id === 'raider' || card.id === 'pogrom') {
    socket.emit('playMafiaCard', { cardId: card.id }, (r) => handleCardResult(card.id, r));
  }
}

// ===== LOBBY ROOM BROWSER =====
async function loadPublicRooms() {
  try {
    const res = await fetch('/api/rooms');
    const rooms = await res.json();
    const container = document.getElementById('room-list');
    if (!container) return;
    if (rooms.length === 0) {
      container.innerHTML = '<div class="no-rooms">Немає відкритих кімнат</div>';
      return;
    }
    container.innerHTML = rooms.map(r => `
      <div class="room-item" data-room="${r.roomId}">
        <span class="room-host">${r.hostName}</span>
        <span class="room-players">${r.playerCount}/8</span>
        <span class="room-code">${r.roomId}</span>
        <button class="btn btn-secondary btn-sm room-join-btn" data-code="${r.roomId}">Увійти</button>
      </div>
    `).join('');
    container.querySelectorAll('.room-join-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('room-code').value = btn.dataset.code;
        document.getElementById('btn-join').click();
      });
    });
  } catch(e) {}
}

// ===== CHEAT/DEBUG PANEL =====
// Server tells us whether cheats are enabled. On production this is false,
// so we never bind the backtick shortcut and the panel is unreachable.
let _cheatsEnabled = false;
socket.on('serverConfig', (cfg) => { _cheatsEnabled = !!(cfg && cfg.cheatsEnabled); });

(function initCheatPanel() {
  const CHEAT_CARDS = [
    { id: 'sniper', name: 'Снайпер', type: 'attack' },
    { id: 'robbery', name: 'Пограбування', type: 'economic' },
    { id: 'raider', name: 'Рейдерське захоплення', type: 'economic' },
    { id: 'massacre', name: 'Бійня', type: 'attack' },
    { id: 'ambush', name: 'Засідка', type: 'attack' },
    { id: 'pogrom', name: 'Погром', type: 'economic' },
    { id: 'lawyer', name: 'Адвокат', type: 'utility' },
    { id: 'vest', name: 'Бронежилет', type: 'defense' },
    { id: 'killer', name: 'Кілер', type: 'attack' },
    { id: 'poison', name: 'Отрута', type: 'attack' },
    { id: 'bribe_inmates', name: 'Підкуп співкамерників', type: 'attack' },
    { id: 'rumors', name: 'Розпустити чутки', type: 'utility' },
    { id: 'police_card', name: 'Поліція', type: 'defense' },
    { id: 'kompromat', name: 'Компромат', type: 'utility' },
    { id: 'bomb', name: 'Бомба', type: 'trap' },
    { id: 'lucky_shirt', name: 'Народжений у сорочці', type: 'defense' },
    { id: 'car_bomb', name: 'Авто-бомба', type: 'attack' },
    { id: 'tax_collector', name: 'Збирач данини', type: 'economic' },
    { id: 'sabotage', name: 'Саботаж', type: 'economic' },
    { id: 'witness_protection', name: 'Захист свідків', type: 'defense' },
    { id: 'double_agent', name: 'Подвійний агент', type: 'utility' },
    { id: 'insurance', name: 'Страховка', type: 'defense' },
    { id: 'blackmail', name: 'Шантаж', type: 'economic' },
    { id: 'arson', name: 'Підпал', type: 'attack' },
    { id: 'corruption', name: 'Корупція', type: 'utility' },
    { id: 'money_laundering', name: 'Відмивання грошей', type: 'economic' },
    { id: 'hostile_takeover', name: 'Вороже поглинання', type: 'economic' }
  ];

  const CHEAT_HELPERS = [
    { id: 'stanley_pollak', name: 'Стенлі Поллак', ability: 'buyInfluenceAnywhere' },
    { id: 'whitey_ross', name: '«Уайті» Росс', ability: 'ignorePolice' },
    { id: 'mad_dog', name: '«Скажений Пес»', ability: 'freeAmbush' },
    { id: 'lenny_pike', name: 'Ленні «Щука»', ability: 'spyCards' },
    { id: 'leo_acrobat', name: 'Лео «Акробат»', ability: 'earlyRelease' },
    { id: 'willie_ruthless', name: 'Віллі «Безжалісний»', ability: 'robOnKill' },
    { id: 'tony_fox', name: 'Тоні «Лис»', ability: 'influenceOnKill' },
    { id: 'capo_corrado', name: 'Капо Коррадо', ability: 'extraStep' },
    { id: 'mickey_renegade', name: 'Міккі «Відступник»', ability: 'policeTax' },
    { id: 'baby_flemmi', name: 'Малюк Флеммі', ability: 'counterAttack' },
    { id: 'tommy_morello', name: 'Томмі Морелло', ability: 'diplomat' },
    { id: 'nikki_king', name: 'Ніккі «Король»', ability: 'doubleMafia' },
    { id: 'survivor_joe', name: 'Живучий Джо', ability: 'surviveOnce' },
    { id: 'steel_ronnie', name: '«Сталевий» Ронні', ability: 'doubleBuyOff' },
    { id: 'donnie_angelo', name: 'Донні Анджело', ability: 'freeInfluenceOnStart' },
    { id: 'marco_player', name: 'Марко «Гравець»', ability: 'casinoTriple' }
  ];

  const TYPE_COLORS = {
    attack: '#e74c3c', economic: '#f39c12', utility: '#3498db',
    defense: '#2ecc71', trap: '#9b59b6'
  };

  function buildCheatPanel() {
    const overlay = document.createElement('div');
    overlay.id = 'cheat-overlay';
    overlay.style.cssText = `
      display:none; position:fixed; top:0; left:0; width:100%; height:100%;
      background:rgba(0,0,0,0.92); z-index:99999; overflow-y:auto;
      font-family:'Segoe UI',Arial,sans-serif; padding:20px; box-sizing:border-box;
    `;

    let html = `
      <div style="max-width:900px;margin:0 auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h2 style="color:#f1c40f;margin:0;font-size:22px;">CHEAT PANEL</h2>
          <button id="cheat-close" style="background:none;border:2px solid #f1c40f;color:#f1c40f;
            padding:6px 18px;cursor:pointer;font-size:16px;border-radius:4px;">CLOSE [~]</button>
        </div>
        <div id="cheat-status" style="color:#2ecc71;font-size:13px;margin-bottom:12px;min-height:18px;"></div>

        <!-- MONEY & TELEPORT & BOMB row -->
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
          <div style="background:#1a1a2e;border:1px solid #333;border-radius:6px;padding:12px;flex:1;min-width:200px;">
            <h4 style="color:#f1c40f;margin:0 0 8px;">Set Money</h4>
            <div style="display:flex;gap:6px;">
              <input id="cheat-money" type="number" value="50000" style="flex:1;background:#111;color:#fff;
                border:1px solid #555;padding:6px 8px;border-radius:4px;font-size:14px;min-width:0;" />
              <button class="cheat-btn" onclick="window._cheatSetMoney()">SET</button>
            </div>
          </div>
          <div style="background:#1a1a2e;border:1px solid #333;border-radius:6px;padding:12px;flex:1;min-width:200px;">
            <h4 style="color:#f1c40f;margin:0 0 8px;">Teleport to Sector</h4>
            <div style="display:flex;gap:6px;">
              <input id="cheat-sector" type="number" value="0" min="0" max="35" style="flex:1;background:#111;
                color:#fff;border:1px solid #555;padding:6px 8px;border-radius:4px;font-size:14px;min-width:0;" />
              <button class="cheat-btn" onclick="window._cheatTeleport()">GO</button>
            </div>
          </div>
          <div style="background:#1a1a2e;border:1px solid #333;border-radius:6px;padding:12px;flex:1;min-width:200px;">
            <h4 style="color:#f1c40f;margin:0 0 8px;">Place Bomb</h4>
            <div style="display:flex;gap:6px;">
              <input id="cheat-bomb" type="number" value="5" min="0" max="35" style="flex:1;background:#111;
                color:#fff;border:1px solid #555;padding:6px 8px;border-radius:4px;font-size:14px;min-width:0;" />
              <button class="cheat-btn" onclick="window._cheatPlaceBomb()">BOMB</button>
            </div>
          </div>
        </div>

        <!-- MAFIA CARDS -->
        <h3 style="color:#f1c40f;margin:0 0 10px;font-size:16px;">MAFIA CARDS</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px;margin-bottom:20px;">
    `;

    for (const card of CHEAT_CARDS) {
      const col = TYPE_COLORS[card.type] || '#aaa';
      html += `
        <div style="background:#1a1a2e;border:1px solid ${col}44;border-radius:6px;padding:8px 10px;
          display:flex;justify-content:space-between;align-items:center;">
          <div>
            <span style="color:${col};font-weight:bold;font-size:13px;">${card.name}</span>
            <span style="color:#888;font-size:11px;margin-left:6px;">[${card.type}]</span>
          </div>
          <button class="cheat-btn cheat-btn-sm" onclick="window._cheatAddCard('${card.id}')">+ Add</button>
        </div>`;
    }

    html += `</div>
        <!-- HELPERS -->
        <h3 style="color:#f1c40f;margin:0 0 10px;font-size:16px;">HELPERS</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;margin-bottom:30px;">
    `;

    for (const h of CHEAT_HELPERS) {
      html += `
        <div style="background:#1a1a2e;border:1px solid #3498db44;border-radius:6px;padding:8px 10px;
          display:flex;justify-content:space-between;align-items:center;">
          <div>
            <span style="color:#3498db;font-weight:bold;font-size:13px;">${h.name}</span>
            <span style="color:#888;font-size:11px;margin-left:6px;">[${h.ability}]</span>
          </div>
          <button class="cheat-btn cheat-btn-sm" onclick="window._cheatAddHelper('${h.id}')">+ Hire</button>
        </div>`;
    }

    html += `</div></div>`;
    overlay.innerHTML = html;

    // Inject CSS for cheat buttons
    const style = document.createElement('style');
    style.textContent = `
      .cheat-btn {
        background: linear-gradient(135deg, #f1c40f, #e67e22);
        color: #1a1a2e; font-weight: bold; border: none; padding: 6px 14px;
        border-radius: 4px; cursor: pointer; font-size: 13px; white-space: nowrap;
        transition: transform 0.1s, box-shadow 0.1s;
      }
      .cheat-btn:hover { transform: scale(1.05); box-shadow: 0 0 8px rgba(241,196,15,0.5); }
      .cheat-btn:active { transform: scale(0.97); }
      .cheat-btn-sm { padding: 4px 10px; font-size: 12px; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(overlay);

    document.getElementById('cheat-close').addEventListener('click', toggleCheatPanel);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) toggleCheatPanel(); });
  }

  function cheatStatus(msg, isError) {
    const el = document.getElementById('cheat-status');
    if (el) {
      el.textContent = msg;
      el.style.color = isError ? '#e74c3c' : '#2ecc71';
    }
  }

  function toggleCheatPanel() {
    let overlay = document.getElementById('cheat-overlay');
    if (!overlay) { buildCheatPanel(); overlay = document.getElementById('cheat-overlay'); }
    overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none';
  }

  window._cheatAddCard = function(cardId) {
    socket.emit('cheat_addCard', { cardId }, (res) => {
      if (res.error) cheatStatus('ERROR: ' + res.error, true);
      else cheatStatus('Card added: ' + cardId);
    });
  };

  window._cheatAddHelper = function(helperId) {
    socket.emit('cheat_addHelper', { helperId }, (res) => {
      if (res.error) cheatStatus('ERROR: ' + res.error, true);
      else cheatStatus('Helper hired: ' + helperId);
    });
  };

  window._cheatSetMoney = function() {
    const amount = parseInt(document.getElementById('cheat-money').value) || 50000;
    socket.emit('cheat_setMoney', { amount }, (res) => {
      if (res.error) cheatStatus('ERROR: ' + res.error, true);
      else cheatStatus('Money set to $' + amount);
    });
  };

  window._cheatTeleport = function() {
    const sector = parseInt(document.getElementById('cheat-sector').value) || 0;
    socket.emit('cheat_teleport', { sector }, (res) => {
      if (res.error) cheatStatus('ERROR: ' + res.error, true);
      else cheatStatus('Teleported to sector ' + sector);
    });
  };

  window._cheatPlaceBomb = function() {
    const sector = parseInt(document.getElementById('cheat-bomb').value) || 5;
    socket.emit('cheat_placeBomb', { sector }, (res) => {
      if (res.error) cheatStatus('ERROR: ' + res.error, true);
      else cheatStatus('Bomb placed at sector ' + sector);
    });
  };

  // Keyboard shortcut: backtick toggles cheat panel (only if server allows cheats)
  document.addEventListener('keydown', (e) => {
    if (!_cheatsEnabled) return;
    if (e.key === '`' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // Don't toggle if typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      toggleCheatPanel();
    }
  });
})();

// ===== UTILITY =====
function handleResult(res, options = {}) {
  if (res && res.error) {
    notifyError(res.error, options);
    return false;
  }
  return true;
}

function describePendingAction(action, state) {
  if (!action) return '';
  const actor = state?.players?.find(p => p.id === action.playerId)?.name;
  switch (action.type) {
    case 'auction':
      return `Йде аукціон за ${action.businessName || 'бізнес'}.`;
    case 'attack_reaction':
      return actor ? `${actor} чекає на відповідь цілі.` : 'Йде реакція на атаку.';
    case 'police_choice':
      return 'Вирішується реакція поліції.';
    case 'bar_choice':
      return actor ? `${actor} обирає дію в BAR.` : 'Хтось обирає дію в BAR.';
    case 'start_bonus_choice':
      return actor ? `${actor} обирає стартовий бонус.` : 'Обирається стартовий бонус.';
    case 'buy_business':
    case 'buy_business_choice':
      return actor ? `${actor} вирішує, чи купувати бізнес.` : 'Йде вибір покупки бізнесу.';
    case 'buy_business_by_influence':
      return actor ? `${actor} захоплює бізнес через вплив.` : 'Йде захоплення бізнесу.';
    case 'pay_rent':
      return actor ? `${actor} вирішує питання з оплатою.` : 'Йде розрахунок за бізнес.';
    case 'pay_bills':
      return actor ? `${actor} оплачує рахунки.` : 'Йде оплата рахунків.';
    case 'feds_bribe_or_prison':
      return actor ? `${actor} вирішує питання з федералами.` : 'Йде рішення по федералах.';
    case 'hire_helper':
      return actor ? `${actor} обирає нового помічника.` : 'Йде вибір помічника.';
    case 'hire_another_choice':
      return actor ? `${actor} вирішує, чи наймати ще.` : 'Йде рішення про найм.';
    case 'lose_helper_choice':
      return actor ? `${actor} втрачає помічника та обирає кого.` : 'Йде втрата помічника.';
    case 'hidden_helper_choice':
      return actor ? `${actor} приховано обирає помічника.` : 'Йде прихований вибір помічника.';
    default:
      return actor ? `${actor} приймає рішення...` : 'Очікування рішення...';
  }
}

// ============================================================
// TV MODE
// ============================================================
if (isTVMode) {
  document.addEventListener('DOMContentLoaded', () => {
    // Show TV screen on load
    $$('.screen').forEach(s => s.classList.remove('active'));
    const tvScreen = $('#tv-screen');
    tvScreen.classList.add('active');

    // Create room on load
    socket.emit('createRoomTV', {}, (res) => {
      if (!handleResult(res, { title: 'Створення TV-кімнати' })) return;
      myRoomId = res.roomId;
      $('#tv-room-code').textContent = res.roomId;
      const host = location.origin;
      $('#tv-join-hint').textContent = `Приєднуйтесь: ${host}/?mode=phone&room=${res.roomId}`;
    });

    // Add bot button
    $('#tv-btn-add-bot').addEventListener('click', () => {
      socket.emit('addBot', {}, (res) => {
        handleResult(res, { title: 'Додавання бота' });
      });
    });

    // Start game button
    $('#tv-btn-start').addEventListener('click', () => {
      socket.emit('startGame', {}, (res) => {
        handleResult(res, { title: 'Старт матчу' });
      });
    });

    // Fullscreen
    const fsBtn = $('#tv-btn-fullscreen');
    if (fsBtn) fsBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    });

    // Restart
    const restBtn = $('#tv-btn-restart');
    if (restBtn) restBtn.addEventListener('click', () => {
      if (confirm('Перезапустити матч?')) {
        socket.emit('restartGame', {}, (res) => {
          if (!handleResult(res, { title: 'Перезапуск матчу' })) return;
        });
      }
    });

    socket.on('gameRestarted', () => {
      notifyInfo('Матч перезапущено. Повернення в лобі…', { title: 'TV режим' });
    });
  });
}

function renderTVState(state) {
  gameState = state;
  const tvScreen = $('#tv-screen');
  if (!tvScreen.classList.contains('active')) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    tvScreen.classList.add('active');
  }

  if (state.phase === 'waiting') {
    renderTVWaiting(state);
  } else if (state.phase === 'rolling_order') {
    renderTVRollOrder(state);
  } else if (state.phase === 'finished') {
    renderTVGame(state);
    renderTVVictory(state);
  } else {
    renderTVGame(state);
  }
}

function renderTVWaiting(state) {
  $('#tv-waiting').style.display = '';
  $('#tv-game').style.display = 'none';
  $('#tv-victory').style.display = 'none';
  $('#tv-roll-order').style.display = 'none';

  const list = $('#tv-players-list');
  list.innerHTML = '';
  for (const p of state.players) {
    const el = document.createElement('div');
    el.className = 'tv-player-card';
    const portrait = PORTRAITS[p.character?.id] || '';
    el.innerHTML = `
      <div class="tv-player-portrait">${portrait}</div>
      <div class="tv-player-name">${p.name}</div>
      ${p.isBot ? '<div class="tv-player-bot">BOT</div>' : ''}
    `;
    list.appendChild(el);
  }

  // Show/hide start button
  const canStart = state.players.length >= 2;
  $('#tv-btn-start').style.display = canStart ? '' : 'none';
}

function renderTVRollOrder(state) {
  $('#tv-waiting').style.display = 'none';
  $('#tv-game').style.display = 'none';
  $('#tv-victory').style.display = 'none';
  $('#tv-roll-order').style.display = '';

  // Status message — who we're waiting for
  let statusEl = document.getElementById('tv-ro-status');
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = 'tv-ro-status';
    statusEl.className = 'tv-ro-status';
    const title = document.querySelector('.tv-ro-title');
    if (title) title.after(statusEl);
  }
  const currentPlayer = state.orderRollCurrentId ? state.players.find(p => p.id === state.orderRollCurrentId) : null;
  if (currentPlayer && !currentPlayer.isBot) {
    statusEl.innerHTML = `Очікуємо: <strong>${currentPlayer.name}</strong> кидає кубик на телефоні...`;
    statusEl.style.display = '';
  } else if (currentPlayer && currentPlayer.isBot) {
    statusEl.innerHTML = `<strong>${currentPlayer.name}</strong> кидає кубик...`;
    statusEl.style.display = '';
  } else {
    statusEl.style.display = 'none';
  }

  const container = $('#tv-ro-players');
  container.innerHTML = '';
  for (const p of state.players) {
    const el = document.createElement('div');
    el.className = 'tv-ro-player';
    const portrait = PORTRAITS[p.character?.id] || '';
    const rollVal = (state.orderRolls && state.orderRolls[p.id]) ? state.orderRolls[p.id] : '...';
    const isCurrent = state.orderRollCurrentId === p.id;
    if (isCurrent) el.classList.add('tv-ro-current');
    el.innerHTML = `
      <div class="tv-ro-portrait">${portrait}</div>
      <div class="tv-ro-name">${p.name}</div>
      <div class="tv-ro-roll">${ICON.dice} ${rollVal}</div>
    `;
    container.appendChild(el);
  }
}

function renderTVGame(state) {
  $('#tv-waiting').style.display = 'none';
  $('#tv-roll-order').style.display = 'none';
  $('#tv-game').style.display = '';

  if (state.phase === 'finished') {
    // Keep game visible behind victory
  } else {
    $('#tv-victory').style.display = 'none';
  }

  // Room badge
  const badge = $('#tv-room-badge');
  if (badge && myRoomId) badge.textContent = myRoomId;

  // Turn info
  const turnInfo = $('#tv-turn-info');
  const current = state.players[state.currentPlayerIndex];
  if (current) {
    const color = current.character?.color || '#fff';
    turnInfo.innerHTML = `<span style="color:${color}">${current.name}</span> — ${state.turnPhase === 'roll' ? 'кидає кубики' : 'дія'}`;
  }

  // Round info
  const roundInfo = $('#tv-round-info');
  if (roundInfo) roundInfo.textContent = `Коло ${state.currentRound || 1}`;

  // Restart button
  const restBtn = $('#tv-btn-restart');
  if (restBtn) restBtn.style.display = (state.phase === 'playing' || state.phase === 'finished') ? '' : 'none';

  // Board — reuse renderBoard but target TV container
  renderBoardInto(state, '#tv-game-board');

  // Player panels
  renderTVPlayerPanels(state);

  // Log
  renderTVLog(state);
}

function renderBoardInto(state, selector) {
  const board = document.querySelector(selector);
  if (!board) return;
  board.innerHTML = '';

  const cellMap = {};
  const gridData = state.boardGrid || {};
  for (const sector of state.board) {
    const pos = gridData[sector.index];
    if (pos) cellMap[`${pos.row}-${pos.col}`] = sector;
  }

  for (let row = 1; row <= 8; row++) {
    for (let col = 1; col <= 12; col++) {
      const cell = document.createElement('div');
      const key = `${row}-${col}`;
      const sector = cellMap[key];

      if (sector) {
        const side = getSide(row, col);
        const cornerClass = getCornerSide(sector.index);
        cell.className = `board-cell ${sector.type.toLowerCase()} ${side} ${cornerClass}`.trim();
        cell.dataset.index = sector.index;
        renderCellInner(cell, sector, state, side);

        // Player tokens
        const tokens = getPlayersOnSector(sector.index, state);
        tokens.forEach((p, i) => {
          const token = document.createElement('div');
          token.className = 'player-token';
          token.dataset.pid = p.id;
          const pColor = p.character ? p.character.color : '#888';
          token.style.background = pColor;
          token.style.color = pColor;
          token.title = p.name;
          token.textContent = (p.name || '?')[0];
          if (tokens.length === 1) {
            token.style.top = '50%'; token.style.left = '50%';
            token.style.transform = 'translate(-50%, -50%)';
          } else {
            const radius = Math.min(tokens.length <= 4 ? 13 : 16, 18);
            const angle = (2 * Math.PI * i / tokens.length) - Math.PI / 2;
            token.style.top = '50%'; token.style.left = '50%';
            token.style.transform = `translate(calc(-50% + ${(Math.cos(angle)*radius).toFixed(1)}px), calc(-50% + ${(Math.sin(angle)*radius).toFixed(1)}px))`;
          }
          cell.appendChild(token);
        });

        // Bombs
        if (state.bombs && state.bombs.some(b => b.sector === sector.index)) {
          cell.classList.add('has-bomb');
          const bomb = document.createElement('div');
          bomb.className = 'bomb-marker';
          bomb.innerHTML = `<svg viewBox="0 0 64 64" width="32" height="32"><circle cx="32" cy="38" r="20" fill="#1a1a1a" stroke="#ff4400" stroke-width="2"/><circle cx="32" cy="38" r="16" fill="#333"/><rect x="29" y="12" width="6" height="12" rx="3" fill="#888"/><circle cx="32" cy="8" r="5" fill="#ff6600" opacity="0.9"><animate attributeName="r" values="4;6;4" dur="0.8s" repeatCount="indefinite"/></circle></svg>`;
          cell.appendChild(bomb);
        }
      } else {
        cell.className = 'board-cell empty';
      }

      cell.style.gridRow = row;
      cell.style.gridColumn = col;
      board.appendChild(cell);
    }
  }
}

function renderTVPlayerPanels(state) {
  const container = $('#tv-player-panels');
  if (!container) return;
  container.innerHTML = '';

  for (const p of state.players) {
    const el = document.createElement('div');
    el.className = 'tv-pp';
    const isCurrent = state.players[state.currentPlayerIndex]?.id === p.id;
    if (isCurrent) el.classList.add('tv-pp-active');
    if (!p.alive) el.classList.add('tv-pp-dead');
    if (p.inPrison > 0) el.classList.add('tv-pp-prison');

    const color = p.character?.color || '#888';
    const portrait = PORTRAITS[p.character?.id] || '';
    const bizCount = (p.businesses || []).length;
    const helperCount = (p.helpers || []).length;
    const respectLevel = p.respectLevel || 1;

    el.innerHTML = `
      <div class="tv-pp-header" style="border-color:${color}">
        <div class="tv-pp-portrait">${portrait}</div>
        <div class="tv-pp-info">
          <div class="tv-pp-name" style="color:${color}">${p.name}</div>
          <div class="tv-pp-money">$${(p.money || 0).toLocaleString()}</div>
        </div>
      </div>
      <div class="tv-pp-stats">
        <span title="Повага">${ICON.crown} ${respectLevel}</span>
        <span title="Бізнеси">${ICON.building} ${bizCount}</span>
        <span title="Помічники">${ICON.handshake} ${helperCount}</span>
        ${p.inPrison > 0 ? `<span class="tv-pp-prison-badge">${ICON.lock} ${p.inPrison}</span>` : ''}
        ${!p.alive ? '<span class="tv-pp-dead-badge">ВИБУВ</span>' : ''}
      </div>
    `;
    container.appendChild(el);
  }
}

function renderTVLog(state) {
  const logEl = $('#tv-game-log');
  if (!logEl || !state.log) return;
  const entries = state.log.slice(-15); // show last 15
  logEl.innerHTML = entries.map(l => `<div class="tv-log-entry">${l.message}</div>`).join('');
  logEl.scrollTop = logEl.scrollHeight;
}

function renderTVVictory(state) {
  $('#tv-victory').style.display = '';
  const content = $('#tv-victory-content');
  if (!state.winner) {
    content.innerHTML = '<div class="tv-victory-title">ГРА ЗАВЕРШЕНА</div>';
    return;
  }
  const w = state.winner;
  const portrait = PORTRAITS[w.character?.id] || '';
  const color = w.character?.color || '#c9a84c';
  content.innerHTML = `
    <div class="tv-victory-crown">${ICON.crown}</div>
    <div class="tv-victory-portrait" style="border-color:${color}">${portrait}</div>
    <div class="tv-victory-title" style="color:${color}">${w.name}</div>
    <div class="tv-victory-subtitle">ПЕРЕМОЖЕЦЬ!</div>
    <div class="tv-victory-stats">
      <div>$${(w.money || 0).toLocaleString()}</div>
      <div>${ICON.building} ${(w.businesses || []).length} бізнесів</div>
      <div>${ICON.crown} Повага: ${w.respectLevel || 1}</div>
    </div>
  `;
}

// ============================================================
// PHONE CONTROLLER MODE
// ============================================================
let phoneSelectedCharacterId = null;
let phoneActiveTab = 'actions';

if (isPhoneMode) {
  document.addEventListener('DOMContentLoaded', () => {
    // Show phone screen
    $$('.screen').forEach(s => s.classList.remove('active'));
    $('#phone-screen').classList.add('active');

    // Pre-fill room code from URL
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl) $('#phone-room-code').value = roomFromUrl;

    // Build character select
    const charContainer = $('#phone-character-select');
    if (charContainer) {
      CHARACTER_DATA.forEach(c => {
        const el = document.createElement('div');
        el.className = 'char-option';
        el.innerHTML = `<div class="char-portrait">${PORTRAITS[c.id] || ''}</div><div class="char-name">${c.name}</div>`;
        el.addEventListener('click', () => {
          charContainer.querySelectorAll('.char-option').forEach(o => o.classList.remove('selected'));
          el.classList.add('selected');
          phoneSelectedCharacterId = c.id;
        });
        charContainer.appendChild(el);
      });
    }

    // Join button
    $('#phone-btn-join').addEventListener('click', () => {
      const name = $('#phone-player-name').value.trim();
      const code = $('#phone-room-code').value.trim().toUpperCase();
      if (!name) { $('#phone-lobby-error').textContent = "Введіть ім'я!"; return; }
      if (!code) { $('#phone-lobby-error').textContent = 'Введіть код кімнати!'; return; }
      socket.emit('joinRoom', { roomId: code, playerName: name, characterId: phoneSelectedCharacterId }, (res) => {
        if (res.error) { $('#phone-lobby-error').textContent = res.error; return; }
        myId = res.playerId;
        myRoomId = res.roomId;
        sessionStorage.setItem('mafia_roomId', res.roomId);
        sessionStorage.setItem('mafia_playerName', name);
        if (res.rejoinToken) sessionStorage.setItem('mafia_rejoinToken', res.rejoinToken);
        // Switch to waiting
        $('#phone-lobby').style.display = 'none';
        $('#phone-waiting').style.display = '';
        $('#phone-room-display').textContent = res.roomId;
      });
    });

    // Tab switching
    document.querySelectorAll('.phone-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.phone-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        phoneActiveTab = tab.dataset.tab;
        if (gameState) renderPhoneTabContent(gameState);
      });
    });

    // Reconnection
    socket.on('connect', () => {
      const savedRoom = sessionStorage.getItem('mafia_roomId');
      const savedName = sessionStorage.getItem('mafia_playerName');
      const savedToken = sessionStorage.getItem('mafia_rejoinToken');
      if (savedRoom && savedName && savedToken && !myRoomId) {
        socket.emit('rejoinRoom', { roomId: savedRoom, playerName: savedName, rejoinToken: savedToken }, (res) => {
          if (res.success) {
            myId = res.playerId;
            myRoomId = res.roomId;
          } else {
            sessionStorage.removeItem('mafia_roomId');
            sessionStorage.removeItem('mafia_playerName');
            sessionStorage.removeItem('mafia_rejoinToken');
          }
        });
      }
    });

    socket.on('gameRestarted', () => {
      notifyInfo('Матч перезапущено. Повернення в лобі…', { title: 'Телефон' });
    });
  });
}

function renderPhoneState(state) {
  const prevState = gameState;
  gameState = state;

  const phoneScreen = $('#phone-screen');
  if (!phoneScreen.classList.contains('active')) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    phoneScreen.classList.add('active');
  }

  if (state.phase === 'waiting') {
    $('#phone-lobby').style.display = 'none';
    $('#phone-waiting').style.display = '';
    $('#phone-game').style.display = 'none';
    $('#phone-players-count').textContent = `Гравців: ${state.players.length}`;
    return;
  }

  if (state.phase === 'rolling_order') {
    $('#phone-lobby').style.display = 'none';
    $('#phone-waiting').style.display = 'none';
    $('#phone-game').style.display = '';
    renderPhoneRollOrder(state);
    return;
  }

  // playing or finished
  $('#phone-lobby').style.display = 'none';
  $('#phone-waiting').style.display = 'none';
  $('#phone-game').style.display = '';
  renderPhoneGame(state);
}

function renderPhoneRollOrder(state) {
  const me = state.players.find(p => p.id === myId);
  const header = $('#phone-player-info');
  if (me) {
    const color = me.character?.color || '#fff';
    header.innerHTML = `<span style="color:${color}">${me.name}</span>`;
  }
  $('#phone-turn-indicator').textContent = 'Визначення порядку ходів';
  $('#phone-status').textContent = '';

  const main = $('#phone-main');
  const isCurrent = state.orderRollCurrentId === myId;
  const alreadyRolled = state.orderRolls && state.orderRolls[myId];

  if (isCurrent && !alreadyRolled) {
    main.innerHTML = `<button class="phone-btn-roll" id="phone-roll-order-btn">${ICON.dice} Кинути кубик</button>`;
    document.getElementById('phone-roll-order-btn').addEventListener('click', () => {
      socket.emit('rollForOrder', {}, (res) => {
        handleResult(res, { title: 'Кидок для черги' });
      });
    });
  } else if (alreadyRolled) {
    main.innerHTML = `<div class="phone-roll-result">${ICON.dice} Ваш результат: ${state.orderRolls[myId]}</div>`;
  } else {
    main.innerHTML = '<div class="phone-waiting-turn">Очікуйте свою чергу...</div>';
  }

  $('#phone-tab-content').innerHTML = '';
}

function renderPhoneGame(state) {
  const me = state.players.find(p => p.id === myId);
  if (!me) return;

  const color = me.character?.color || '#fff';
  const header = $('#phone-player-info');
  header.innerHTML = `
    <span style="color:${color}">${me.name}</span>
    <span class="phone-money">$${(me.money || 0).toLocaleString()}</span>
    <span class="phone-respect">${ICON.crown} ${me.respectLevel || 1}</span>
  `;

  const isMyTurn = state.players[state.currentPlayerIndex]?.id === myId;
  const current = state.players[state.currentPlayerIndex];
  const turnInd = $('#phone-turn-indicator');
  turnInd.innerHTML = isMyTurn ? '<span class="phone-your-turn">ВАШ ХІД!</span>' :
    `Хід: <span style="color:${current?.character?.color || '#fff'}">${current?.name || '?'}</span>`;

  const status = $('#phone-status');
  const phaseLabel = state.turnPhase === 'roll' ? 'Кубики' : 'Дія';
  const pendingLabel = !isMyTurn ? describePendingAction(state.pendingAction, state) : '';
  status.textContent = `Коло ${state.currentRound || 1} | ${phaseLabel}${pendingLabel ? ` | ${pendingLabel}` : ''}`;

  // Main action area
  const main = $('#phone-main');
  main.innerHTML = '';

  if (state.phase === 'finished') {
    const winner = state.winner;
    main.innerHTML = `<div class="phone-victory">${ICON.crown} ${winner ? winner.name + ' переміг!' : 'Гру завершено!'}</div>`;
    return;
  }

  if (!me.alive) {
    main.innerHTML = '<div class="phone-dead">Ви вибули з гри</div>';
    return;
  }

  if (me.inPrison > 0) {
    main.innerHTML = `<div class="phone-prison">${ICON.lock} Ви у в'язниці (${me.inPrison} ходів)</div>`;
  }

  if (isMyTurn) {
    if (state.turnPhase === 'roll') {
      const rollBtn = document.createElement('button');
      rollBtn.className = 'phone-btn-roll';
      rollBtn.innerHTML = `${ICON.dice} КИНУТИ КУБИКИ`;
      rollBtn.addEventListener('click', () => {
        rollBtn.disabled = true;
        socket.emit('rollDice', {}, (res) => {
          if (res && res.error) {
            rollBtn.disabled = false;
            notifyError(res.error, { title: 'Кидок кубиків' });
          }
        });
      });
      main.appendChild(rollBtn);

      if (me.inPrison > 0 && me.mafiaCards && me.mafiaCards.some(c => c.id === 'lawyer')) {
        const lawyerBtn = document.createElement('button');
        lawyerBtn.className = 'phone-btn-action';
        lawyerBtn.innerHTML = `${ICON.document} Використати Адвоката`;
        lawyerBtn.addEventListener('click', () => {
          socket.emit('playMafiaCard', { cardId: 'lawyer' }, handleResult);
        });
        main.appendChild(lawyerBtn);
      }
    } else if (state.turnPhase === 'action') {
      // Handle pending actions
      if (phonePendingBelongsToPlayer(state.pendingAction, myId)) {
        renderPhonePendingAction(state, main);
      } else {
        // End turn + other action buttons
        const endBtn = document.createElement('button');
        endBtn.className = 'phone-btn-action phone-btn-end';
        endBtn.innerHTML = 'ЗАВЕРШИТИ ХІД';
        endBtn.addEventListener('click', () => {
          socket.emit('endTurn', {}, (res) => {
            handleResult(res, { title: 'Завершення ходу' });
          });
        });
        main.appendChild(endBtn);

        // Upgrade respect button
        if (me.canUpgradeRespect && me.respectLevel < 5 && me.money >= getNextRespectCost(me.respectLevel || 1)) {
          const respBtn = document.createElement('button');
          respBtn.className = 'phone-btn-action';
          respBtn.innerHTML = `${ICON.crown} Підвищити повагу ($${getNextRespectCost(me.respectLevel || 1)})`;
          respBtn.addEventListener('click', () => {
            socket.emit('upgradeRespect', {}, (res) => {
              handleResult(res, { title: 'Підвищення поваги' });
            });
          });
          main.appendChild(respBtn);
        }
      }
    }
  } else if (state.pendingAction && state.pendingAction.type === 'auction') {
    // Auction — all players can participate
    renderPhoneAuction(state, main);
  } else if (phonePendingBelongsToPlayer(state.pendingAction, myId)) {
    if (state.pendingAction.type === 'attack_reaction') {
      renderPhoneAttackReaction(state, main);
    } else {
      renderPhonePendingAction(state, main);
    }
  } else {
    main.innerHTML = `<div class="phone-waiting-turn">${describePendingAction(state.pendingAction, state) || 'Очікуйте наступний хід...'}</div>`;
  }

  // Render tab content
  renderPhoneTabContent(state);
}

function phonePendingBelongsToPlayer(action, playerId) {
  if (!action || !playerId) return false;
  if (action.playerId === playerId) return true;
  if (action.type === 'attack_reaction' && action.targetId === playerId) return true;
  if (action.type === 'choose_kill_helper' && action.attackerId === playerId) return true;
  return false;
}

function getNextRespectCost(level) {
  const next = (gameState?.respectLevels || []).find(r => r.level === Number(level) + 1);
  return next ? next.upgradeCost : 99999;
}

function renderPhonePendingAction(state, container) {
  const action = state.pendingAction;
  if (!action) return;

  switch (action.type) {
    case 'buy_business': {
      container.innerHTML = `
        <div class="phone-action-title">Купити бізнес?</div>
        <div class="phone-action-desc">${action.businessName} — $${action.price}</div>
        <div class="phone-action-btns">
          <button class="phone-btn-action phone-btn-yes" id="pa-buy">Купити</button>
          <button class="phone-btn-action phone-btn-no" id="pa-skip">Пропустити</button>
        </div>
      `;
      document.getElementById('pa-buy')?.addEventListener('click', () => {
        socket.emit('resolveAction', { actionType: 'buy_business', data: { businessId: action.businessId, buy: true } }, handleResult);
      });
      document.getElementById('pa-skip')?.addEventListener('click', () => {
        socket.emit('resolveAction', { actionType: 'buy_business', data: { businessId: action.businessId, buy: false } }, handleResult);
      });
      break;
    }
    case 'pay_rent': {
      const canRob = action.canRob;
      container.innerHTML = `
        <div class="phone-action-title">Оплата оренди</div>
        <div class="phone-action-desc">${action.businessName} — $${action.amount} (${action.ownerName})</div>
        <div class="phone-action-btns">
          <button class="phone-btn-action phone-btn-yes" id="pa-pay">Заплатити</button>
          ${canRob ? '<button class="phone-btn-action phone-btn-danger" id="pa-rob">Пограбувати</button>' : ''}
          ${action.canBuyout ? `<button class="phone-btn-action" id="pa-buyout">Викупити ($${action.buyoutPrice})</button>` : ''}
        </div>
      `;
      document.getElementById('pa-pay')?.addEventListener('click', () => {
        socket.emit('resolveAction', { actionType: 'pay_rent', data: { useRobbery: false } }, handleResult);
      });
      document.getElementById('pa-rob')?.addEventListener('click', () => {
        socket.emit('resolveAction', { actionType: 'pay_rent', data: { useRobbery: true } }, handleResult);
      });
      document.getElementById('pa-buyout')?.addEventListener('click', () => {
        socket.emit('resolveAction', { actionType: 'buyout_business', data: { businessId: action.businessId } }, handleResult);
      });
      break;
    }
    case 'casino': {
      container.innerHTML = `
        <div class="phone-action-title">${ICON.casino_chip} Казино</div>
        <div class="phone-casino-bets">
          <button class="phone-casino-bet" data-bet="red" style="background:#c0392b">ЧЕРВОНЕ</button>
          <button class="phone-casino-bet" data-bet="black" style="background:#2c3e50">ЧОРНЕ</button>
        </div>
        <div class="phone-casino-amounts">
          <button class="phone-casino-amt" data-amt="500">$500</button>
          <button class="phone-casino-amt" data-amt="1000">$1000</button>
          <button class="phone-casino-amt" data-amt="2000">$2000</button>
        </div>
        <button class="phone-btn-action" id="pa-casino-spin" disabled>Крутити</button>
        <button class="phone-btn-action phone-btn-no" id="pa-casino-skip">Пропустити</button>
      `;
      let selBet = null, selAmt = null;
      container.querySelectorAll('.phone-casino-bet').forEach(btn => {
        btn.addEventListener('click', () => {
          container.querySelectorAll('.phone-casino-bet').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          selBet = btn.dataset.bet;
          document.getElementById('pa-casino-spin').disabled = !(selBet && selAmt);
        });
      });
      container.querySelectorAll('.phone-casino-amt').forEach(btn => {
        btn.addEventListener('click', () => {
          container.querySelectorAll('.phone-casino-amt').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          selAmt = parseInt(btn.dataset.amt);
          document.getElementById('pa-casino-spin').disabled = !(selBet && selAmt);
        });
      });
      document.getElementById('pa-casino-spin')?.addEventListener('click', () => {
        socket.emit('resolveAction', { actionType: 'casino', data: { betType: selBet, betAmount: selAmt } }, handleResult);
      });
      document.getElementById('pa-casino-skip')?.addEventListener('click', () => {
        socket.emit('resolveAction', { actionType: 'casino', data: { betType: 'skip' } }, handleResult);
      });
      break;
    }
    case 'choose_hidden_helper': {
      const hiddenCount = action.cardCount || action.cards?.length || 0;
      if (hiddenCount > 0) {
        container.innerHTML = `<div class="phone-action-title">Оберіть помічника</div><div class="phone-action-desc">Карти закриті. Оберіть одну навмання.</div><div class="phone-helper-cards" id="pa-helper-cards"></div>`;
        const cardsEl = document.getElementById('pa-helper-cards');
        for (let idx = 0; idx < hiddenCount; idx++) {
          const c = document.createElement('div');
          c.className = 'phone-helper-card';
          c.innerHTML = `<div class="phone-helper-name">Таємна карта #${idx + 1}</div><div class="phone-helper-desc">Натисніть, щоб вибрати</div>`;
          c.addEventListener('click', () => {
            socket.emit('resolveAction', { actionType: 'choose_hidden_helper', data: { cardIndex: idx } }, handleResult);
          });
          cardsEl.appendChild(c);
        }
      }
      break;
    }
    case 'hire_another': {
      container.innerHTML = `
        <div class="phone-action-title">Найняти ще помічника?</div>
        <div class="phone-action-desc">Вартість: $1000</div>
        <div class="phone-action-btns">
          <button class="phone-btn-action phone-btn-yes" id="pa-hire">Найняти</button>
          <button class="phone-btn-action phone-btn-no" id="pa-decline">Відмовитись</button>
        </div>
      `;
      document.getElementById('pa-hire')?.addEventListener('click', () => {
        socket.emit('resolveAction', { actionType: 'hire_helper', data: {} }, handleResult);
      });
      document.getElementById('pa-decline')?.addEventListener('click', () => {
        socket.emit('resolveAction', { actionType: 'decline_hire', data: {} }, handleResult);
      });
      break;
    }
    case 'event_confirm': {
      container.innerHTML = `
        <div class="phone-action-title">Подія</div>
        <div class="phone-action-desc">${action.card?.description || action.description || action.eventName || 'Подія'}</div>
        <button class="phone-btn-action phone-btn-yes" id="pa-event-ok">OK</button>
      `;
      document.getElementById('pa-event-ok')?.addEventListener('click', () => {
        socket.emit('resolveAction', { actionType: 'event_confirm', data: {} }, handleResult);
      });
      break;
    }
    case 'mafia_confirm': {
      container.innerHTML = `
        <div class="phone-action-title">Карта мафії</div>
        <div class="phone-action-desc">${action.cards?.map(c => c.name).join(', ') || action.description || 'Ви отримали карту мафії'}</div>
        <button class="phone-btn-action phone-btn-yes" id="pa-mafia-ok">OK</button>
      `;
      document.getElementById('pa-mafia-ok')?.addEventListener('click', () => {
        socket.emit('resolveAction', { actionType: 'mafia_confirm', data: {} }, handleResult);
      });
      break;
    }
    case 'police_landing_choice': {
      container.innerHTML = `
        <div class="phone-action-title">${ICON.police} Поліція</div>
        <div class="phone-action-desc">Оберіть дію:</div>
        <div class="phone-action-btns" id="pa-police-btns"></div>
      `;
      const btnsEl = document.getElementById('pa-police-btns');
      if (action.choices) {
        action.choices.forEach(ch => {
          const btn = document.createElement('button');
          btn.className = 'phone-btn-action';
          btn.textContent = ch.label || ch.id;
          btn.addEventListener('click', () => {
            socket.emit('resolveAction', { actionType: 'police_choice', data: { choiceId: ch.id } }, handleResult);
          });
          btnsEl.appendChild(btn);
        });
      }
      break;
    }
    case 'upgrade_influence_on_own': {
      container.innerHTML = `
        <div class="phone-action-title">Підвищити вплив?</div>
        <div class="phone-action-desc">${action.businessName || ''} — $${action.cost || 0}</div>
        <div class="phone-action-btns">
          <button class="phone-btn-action phone-btn-yes" id="pa-inf-yes">Підвищити</button>
          <button class="phone-btn-action phone-btn-no" id="pa-inf-no">Пропустити</button>
        </div>
      `;
      document.getElementById('pa-inf-yes')?.addEventListener('click', () => {
        socket.emit('resolveAction', { actionType: 'upgrade_influence', data: { upgrade: true } }, handleResult);
      });
      document.getElementById('pa-inf-no')?.addEventListener('click', () => {
        socket.emit('resolveAction', { actionType: 'upgrade_influence', data: { upgrade: false } }, handleResult);
      });
      break;
    }
    case 'seize_prison_business': {
      container.innerHTML = `
        <div class="phone-action-title">Вилучити бізнес?</div>
        <div class="phone-action-desc">${action.businessName} — $${action.price}</div>
        <div class="phone-action-btns">
          <button class="phone-btn-action phone-btn-yes" id="pa-seize-yes">Купити</button>
          <button class="phone-btn-action phone-btn-no" id="pa-seize-no">Пропустити</button>
        </div>
      `;
      document.getElementById('pa-seize-yes')?.addEventListener('click', () => {
        socket.emit('resolveAction', { actionType: 'seize_prison_business', data: { businessId: action.businessId, buy: true } }, handleResult);
      });
      document.getElementById('pa-seize-no')?.addEventListener('click', () => {
        socket.emit('resolveAction', { actionType: 'seize_prison_business', data: { businessId: action.businessId, buy: false } }, handleResult);
      });
      break;
    }
    case 'start_bonus_choice': {
      container.innerHTML = `
        <div class="phone-action-title">Бонус старту!</div>
        <div class="phone-action-desc">Оберіть бонус:</div>
        <div class="phone-action-btns" id="pa-bonus-btns"></div>
      `;
      const bonusBtns = document.getElementById('pa-bonus-btns');
      if (action.choices) {
        action.choices.forEach(ch => {
          const btn = document.createElement('button');
          btn.className = 'phone-btn-action';
          btn.textContent = ch.label || ch.id;
          btn.addEventListener('click', () => {
            socket.emit('resolveAction', { actionType: 'start_bonus', data: { choiceId: ch.id } }, handleResult);
          });
          bonusBtns.appendChild(btn);
        });
      }
      break;
    }
    case 'bar_choice': {
      container.innerHTML = `
        <div class="phone-action-title">БАР</div>
        <div class="phone-action-desc">Оберіть дію:</div>
        <div class="phone-action-btns" id="pa-bar-btns"></div>
      `;
      const barBtns = document.getElementById('pa-bar-btns');
      if (action.choices) {
        action.choices.forEach(ch => {
          const btn = document.createElement('button');
          btn.className = 'phone-btn-action';
          btn.textContent = ch.label || ch.id;
          btn.addEventListener('click', () => {
            socket.emit('resolveAction', { actionType: 'bar_choice', data: { choiceId: ch.id } }, handleResult);
          });
          barBtns.appendChild(btn);
        });
      }
      break;
    }
    case 'choose_own_helper_to_release': {
      container.innerHTML = `<div class="phone-action-title">Обмін помічника</div><div class="phone-action-desc">Оберіть свого помічника, якого віддасте:</div><div class="phone-action-btns" id="pa-own-helper-btns"></div>`;
      const ownBtns = document.getElementById('pa-own-helper-btns');
      (action.ownHelpers || []).forEach((helper, idx) => {
        const btn = document.createElement('button');
        btn.className = 'phone-btn-action';
        btn.textContent = helper.name;
        btn.addEventListener('click', () => {
          socket.emit('resolveAction', { actionType: 'choose_own_helper_to_release', data: { helperIndex: idx } }, handleResult);
        });
        ownBtns.appendChild(btn);
      });
      break;
    }
    case 'choose_stolen_helper': {
      const helperCount = action.helperCount || 0;
      container.innerHTML = `<div class="phone-action-title">Вкрасти помічника</div><div class="phone-action-desc">Оберіть одну з ${helperCount} закритих карт.</div><div class="phone-action-btns" id="pa-stolen-helper-btns"></div>`;
      const stolenBtns = document.getElementById('pa-stolen-helper-btns');
      for (let idx = 0; idx < helperCount; idx++) {
        const btn = document.createElement('button');
        btn.className = 'phone-btn-action';
        btn.textContent = `Таємна карта #${idx + 1}`;
        btn.addEventListener('click', () => {
          socket.emit('resolveAction', { actionType: 'choose_stolen_helper', data: { helperIndex: idx } }, handleResult);
        });
        stolenBtns.appendChild(btn);
      }
      break;
    }
    case 'choose_lose_helper':
    case 'bomb_choose_helper': {
      const me = state.players.find(p => p.id === myId);
      const title = action.type === 'bomb_choose_helper' ? 'Вибух бомби!' : 'Втрата помічника';
      const desc = action.type === 'bomb_choose_helper'
        ? 'Оберіть помічника, який загине.'
        : (action.reason || 'Оберіть помічника.');
      container.innerHTML = `<div class="phone-action-title">${title}</div><div class="phone-action-desc">${desc}</div><div class="phone-action-btns" id="pa-lose-helper-btns"></div>`;
      const loseBtns = document.getElementById('pa-lose-helper-btns');
      (me?.helpers || []).forEach((helper, idx) => {
        const btn = document.createElement('button');
        btn.className = 'phone-btn-action';
        btn.textContent = helper.name;
        btn.addEventListener('click', () => {
          const actionName = action.type === 'bomb_choose_helper' ? 'bomb_choose_helper' : 'choose_lose_helper';
          socket.emit('resolveAction', { actionType: actionName, data: { helperIndex: idx } }, handleResult);
        });
        loseBtns.appendChild(btn);
      });
      break;
    }
    case 'choose_influence_business': {
      container.innerHTML = `<div class="phone-action-title">Додати вплив</div><div class="phone-action-desc">Оберіть бізнес:</div><div class="phone-action-btns" id="pa-influence-btns"></div>`;
      const infBtns = document.getElementById('pa-influence-btns');
      (action.businesses || []).forEach((biz) => {
        const btn = document.createElement('button');
        btn.className = 'phone-btn-action';
        btn.textContent = `${biz.name} (${biz.currentLevel || 0}★)`;
        btn.addEventListener('click', () => {
          socket.emit('resolveAction', { actionType: 'choose_influence_business', data: { businessId: biz.id } }, handleResult);
        });
        infBtns.appendChild(btn);
      });
      break;
    }
    case 'choose_kill_helper': {
      container.innerHTML = `<div class="phone-action-title">Оберіть ціль</div><div class="phone-action-desc">Якого помічника прибрати?</div><div class="phone-action-btns" id="pa-kill-helper-btns"></div>`;
      const killBtns = document.getElementById('pa-kill-helper-btns');
      (action.targetHelpers || []).forEach((helper, idx) => {
        const btn = document.createElement('button');
        btn.className = 'phone-btn-action phone-btn-danger';
        btn.textContent = helper.name;
        btn.addEventListener('click', () => {
          socket.emit('resolveAction', { actionType: 'choose_kill_helper', data: { helperIndex: idx } }, handleResult);
        });
        killBtns.appendChild(btn);
      });
      break;
    }
    case 'discard_mafia_cards': {
      const me = state.players.find(p => p.id === myId);
      const selected = new Set();
      const needed = action.count || 0;
      const renderDiscardChooser = () => {
        container.innerHTML = `<div class="phone-action-title">Скинути карти</div><div class="phone-action-desc">Оберіть ${needed} карт(и): ${selected.size}/${needed}</div><div class="phone-action-btns" id="pa-discard-btns"></div>${selected.size === needed ? '<button class="phone-btn-action phone-btn-yes" id="pa-discard-confirm">Підтвердити</button>' : ''}`;
        const discardBtns = document.getElementById('pa-discard-btns');
        (me?.mafiaCards || []).forEach((card, idx) => {
          const btn = document.createElement('button');
          btn.className = `phone-btn-action ${selected.has(idx) ? 'phone-btn-danger' : ''}`;
          btn.textContent = selected.has(idx) ? `${card.name} ✓` : card.name;
          btn.addEventListener('click', () => {
            if (selected.has(idx)) {
              selected.delete(idx);
            } else if (selected.size < needed) {
              selected.add(idx);
            }
            renderDiscardChooser();
          });
          discardBtns.appendChild(btn);
        });
        document.getElementById('pa-discard-confirm')?.addEventListener('click', () => {
          socket.emit('resolveAction', { actionType: 'discard_mafia', data: { cardIndices: [...selected] } }, handleResult);
        });
      };
      renderDiscardChooser();
      break;
    }
    default: {
      handlePendingAction(state);
      container.innerHTML = `<div class="phone-action-title">Очікуйте дію</div><div class="phone-action-desc">${action.description || ''}</div>`;
    }
  }
}

function renderPhoneAuction(state, container) {
  const action = state.pendingAction;
  if (!action) return;
  const me = state.players.find(p => p.id === myId);
  if (!me || !me.alive) return;
  const hasPassed = action.passed && action.passed.includes(myId);
  const isLeader = action.currentBidderId === myId;

  container.innerHTML = `
    <div class="phone-action-title">${ICON.money} Аукціон</div>
    <div class="phone-action-desc">${action.businessName} — поточна ставка: $${action.currentBid || 0}${action.currentBidderName ? ' (' + action.currentBidderName + ')' : ''}</div>
    ${hasPassed ? '<div class="phone-auction-passed">Ви спасували</div>' : isLeader ? '<div class="phone-auction-leader">Ви лідер ставки!</div>' : `
    <div class="phone-action-btns">
      <button class="phone-btn-action phone-btn-yes" id="pa-auction-raise">Підвищити</button>
      <button class="phone-btn-action phone-btn-no" id="pa-auction-pass">Пас</button>
    </div>`}
  `;
  document.getElementById('pa-auction-raise')?.addEventListener('click', () => {
    socket.emit('auctionRaise', {}, (res) => { handleResult(res, { title: 'Аукціон' }); });
  });
  document.getElementById('pa-auction-pass')?.addEventListener('click', () => {
    socket.emit('auctionPass', {}, (res) => { handleResult(res, { title: 'Аукціон' }); });
  });
}

function renderPhoneAttackReaction(state, container) {
  const action = state.pendingAction;
  if (!action) return;
  container.innerHTML = `
    <div class="phone-action-title">${ICON.swords} Вас атакують!</div>
    <div class="phone-action-desc">${action.attackerName || 'Хтось'} атакує вас картою ${action.card?.name || ''}</div>
    <div class="phone-action-btns">
      ${action.canVest ? '<button class="phone-btn-action" id="pa-react-vest">Бронежилет</button>' : ''}
      ${action.canPolice ? '<button class="phone-btn-action" id="pa-react-police">Поліція</button>' : ''}
      ${action.canBuyOff ? `<button class="phone-btn-action" id="pa-react-buyoff">Відкупитися ($${action.buyOffCost})</button>` : ''}
      <button class="phone-btn-action phone-btn-danger" id="pa-react-nothing">Нічого</button>
    </div>
  `;
  document.getElementById('pa-react-vest')?.addEventListener('click', () => {
    socket.emit('resolveAction', { actionType: 'attack_reaction', data: { reaction: 'vest' } }, handleResult);
  });
  document.getElementById('pa-react-police')?.addEventListener('click', () => {
    socket.emit('resolveAction', { actionType: 'attack_reaction', data: { reaction: 'police' } }, handleResult);
  });
  document.getElementById('pa-react-buyoff')?.addEventListener('click', () => {
    socket.emit('resolveAction', { actionType: 'attack_reaction', data: { reaction: 'buyoff' } }, handleResult);
  });
  document.getElementById('pa-react-nothing')?.addEventListener('click', () => {
    socket.emit('resolveAction', { actionType: 'attack_reaction', data: { reaction: 'nothing' } }, handleResult);
  });
}

function renderPhoneTabContent(state) {
  const tabContent = $('#phone-tab-content');
  if (!tabContent) return;
  const me = state.players.find(p => p.id === myId);
  if (!me) { tabContent.innerHTML = ''; return; }

  switch (phoneActiveTab) {
    case 'actions': {
      // Show mafia card quick-use if it's my turn and action phase
      const isMyTurn = state.players[state.currentPlayerIndex]?.id === myId;
      if (isMyTurn && state.turnPhase === 'action' && me.mafiaCards && me.mafiaCards.length > 0 && !state.pendingAction) {
        tabContent.innerHTML = '<div class="phone-section-title">Карти мафії (натисніть щоб використати)</div>';
        me.mafiaCards.forEach((card, idx) => {
          const el = document.createElement('div');
          el.className = 'phone-mafia-card-item';
          el.innerHTML = `<span class="phone-mc-name">${card.name}</span><span class="phone-mc-desc">${card.description || ''}</span>`;
          el.addEventListener('click', () => {
            onMafiaCardClickExtended(card, state);
          });
          tabContent.appendChild(el);
        });
      } else {
        tabContent.innerHTML = '<div class="phone-section-empty">Немає доступних дій</div>';
      }
      break;
    }
    case 'cards': {
      if (me.mafiaCards && me.mafiaCards.length > 0) {
        tabContent.innerHTML = '<div class="phone-section-title">Карти мафії</div>';
        me.mafiaCards.forEach(card => {
          const el = document.createElement('div');
          el.className = 'phone-mafia-card-item';
          el.innerHTML = `<span class="phone-mc-name">${card.name}</span><span class="phone-mc-desc">${card.description || ''}</span>`;
          tabContent.appendChild(el);
        });
      } else {
        tabContent.innerHTML = '<div class="phone-section-empty">Немає карт</div>';
      }
      break;
    }
    case 'businesses': {
      if (me.businesses && me.businesses.length > 0) {
        tabContent.innerHTML = '<div class="phone-section-title">Мої бізнеси</div>';
        me.businesses.forEach(bizId => {
          const bs = state.businesses[bizId];
          if (!bs) return;
          // Find business data from districts
          let bizName = bizId;
          if (state.districts) {
            for (const d of state.districts) {
              const found = d.businesses.find(b => b.id === bizId);
              if (found) { bizName = found.name; break; }
            }
          }
          const el = document.createElement('div');
          el.className = 'phone-biz-item';
          el.innerHTML = `<span class="phone-biz-name">${bizName}</span><span class="phone-biz-inf">${ICON.crown} ${bs.influenceLevel || 0}</span>`;
          tabContent.appendChild(el);
        });
      } else {
        tabContent.innerHTML = '<div class="phone-section-empty">Немає бізнесів</div>';
      }
      break;
    }
    case 'helpers': {
      if (me.helpers && me.helpers.length > 0) {
        tabContent.innerHTML = '<div class="phone-section-title">Мої помічники</div>';
        me.helpers.forEach(h => {
          const el = document.createElement('div');
          el.className = 'phone-helper-item';
          const portrait = HELPER_PORTRAITS[h.id] || '';
          el.innerHTML = `<div class="phone-helper-portrait">${portrait}</div><div><div class="phone-helper-name">${h.name}</div><div class="phone-helper-desc">${h.ability || ''}</div></div>`;
          tabContent.appendChild(el);
        });
      } else {
        tabContent.innerHTML = '<div class="phone-section-empty">Немає помічників</div>';
      }
      break;
    }
  }
}

// TV mode event handlers
if (isTVMode) {
  socket.on('cardDrawn', (data) => {
    if (!data || !data.playerName) return;
    showCardDrawnEffect(data); // reuse existing function
  });
  socket.on('attackOutcome', (data) => {
    // Show attack result on TV
    if (data && data.type) {
      const msg = data.killed ? `${data.attackerName} вбив ${data.targetName}!` :
        data.type === 'vest' ? `${data.targetName} використав бронежилет!` :
        data.type === 'police' ? `${data.targetName} викликав поліцію!` :
        data.type === 'buyoff' ? `${data.targetName} відкупився!` :
        `Атака: ${data.attackerName} → ${data.targetName}`;
      showTVOverlayMessage(msg, 3000);
    }
  });
  socket.on('rentPaid', (data) => {
    if (data) showTVOverlayMessage(`${data.payerName} заплатив $${data.amount} оренди (${data.businessName})`, 2500);
  });
  socket.on('auctionResult', (data) => {
    if (data && data.winnerName) showTVOverlayMessage(`${data.winnerName} виграв аукціон за ${data.businessName}: $${data.amount}!`, 3000);
  });
}

function showTVOverlayMessage(msg, duration = 3000) {
  const existing = document.querySelector('.tv-overlay-msg');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'tv-overlay-msg';
  el.textContent = msg;
  document.getElementById('tv-game')?.appendChild(el);
  setTimeout(() => el.classList.add('tv-overlay-msg-show'), 10);
  setTimeout(() => {
    el.classList.remove('tv-overlay-msg-show');
    setTimeout(() => el.remove(), 400);
  }, duration);
}
