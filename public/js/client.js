// ============================================================
// MAFIA BUSINESS v3 — Client (Full Redesign)
// ============================================================
const socket = io();

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
let cardRevealActive = false; // true while card reveal is shown — blocks pending actions
let confirmedPendingId = null; // track already-confirmed pending action to avoid re-show
let botAnimationQueue = []; // queue of bot animations to play
let prevCurrentPlayerId = null; // track turn changes for turn start SFX

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

// ===== SVG ICONS for businesses =====
const BIZ_ICONS = {
  smitnik: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>`,
  second_hand: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>`,
  zabigailivky: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M9 10h.01M15 10h.01M9 14h.01M15 14h.01"/></svg>`,
  rynok: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18"/></svg>`,
  pralni: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="13" r="5"/><circle cx="12" cy="13" r="2"/><circle cx="7" cy="6" r="1"/></svg>`,
  transport: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 17h14v-5H5zM5 12V6a2 2 0 012-2h10a2 2 0 012 2v6M7.5 17v2M16.5 17v2M8 14h.01M16 14h.01"/></svg>`,
  kafe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><path d="M6 1v3M10 1v3M14 1v3"/></svg>`,
  telefon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>`,
  magazyny: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 21h18M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16M9 7h6M9 11h6M9 15h3M10 21v-4h4v4"/></svg>`,
  sklady: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 21V8l8-5 8 5v13H4z"/><path d="M9 21v-6h6v6M4 8h16"/></svg>`,
  butlegery: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2h8v4a4 4 0 01-1 2.65V22H9V8.65A4 4 0 018 6V2z"/><path d="M8 6h8"/></svg>`,
  falshyvo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/></svg>`,
  torg_tsentry: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 21h18M4 21V10l8-7 8 7v11M10 14h4v7h-4z"/><path d="M9 10h.01M15 10h.01"/></svg>`,
  avtozapravky: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 21V5a2 2 0 012-2h8a2 2 0 012 2v16M16 10h2a2 2 0 012 2v4a2 2 0 01-2 2h-2M6 8h8M6 12h4"/></svg>`,
  radiostantsiya: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4.9 19.1A15 15 0 0112 2a15 15 0 017.1 17.1"/><path d="M8.3 15.7A8 8 0 0112 6a8 8 0 013.7 9.7"/><circle cx="12" cy="18" r="2"/></svg>`,
  suveniry: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 12v10H4V12M22 7H2v5h20V7zM12 22V7M12 7H7.5a2.5 2.5 0 110-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>`,
  restorany: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L2 7h20L12 2zM17 7v15M7 7v15M2 22h20M4 12h16"/></svg>`,
  pamyatnyky: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 22h16M6 22V8l6-6 6 6v14M10 14h4v8h-4zM10 10h.01M14 10h.01"/></svg>`,
  kluby: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  masazh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="5" r="3"/><path d="M5 21c0-4.4 3.6-8 7-8M19 21c0-4.4-3.6-8-7-8M8 14l-3 7M16 14l3 7"/></svg>`,
  kazyno: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><circle cx="16" cy="9" r="1.5"/><circle cx="8" cy="15" r="1.5"/><circle cx="16" cy="15" r="1.5"/><circle cx="12" cy="12" r="1.5"/></svg>`,
  banky: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 21h18M3 10h18M12 3l9 7H3l9-7zM5 10v8M9 10v8M15 10v8M19 10v8"/></svg>`,
  birzha: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/><path d="M17 9h3v3"/></svg>`,
  sud: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3l9 4v2H3V7l9-4zM5 9v8M9 9v8M15 9v8M19 9v8M3 17h18v4H3z"/></svg>`
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

// ===== LOBBY =====
$('#btn-create').addEventListener('click', () => {
  SFX.click();
  const name = $('#player-name').value.trim();
  if (!name) return showError("Введіть ім'я!");
  socket.emit('createRoom', { playerName: name }, (res) => {
    if (res.error) return showError(res.error);
    myId = res.playerId;
    myRoomId = res.roomId;
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
    showWaiting(res.roomId);
  });
});

function showError(msg) { $('#lobby-error').textContent = msg; }

function showWaiting(roomId) {
  showScreen(waitingScreen);
  $('#room-id-display').textContent = roomId;
}

$('#btn-start').addEventListener('click', () => {
  SFX.click();
  const minRound = parseInt($('#setting-min-round').textContent) || 3;
  socket.emit('startGame', { mafiaCardMinRound: minRound }, (res) => {
    if (res.error) alert(res.error);
  });
});

$('#btn-add-bot').addEventListener('click', () => {
  SFX.click();
  socket.emit('addBot', {}, (res) => {
    if (res && res.error) alert(res.error);
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
    showVictoryScreen(state);
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
    }
  }
});

socket.on('gameStarted', () => {
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
  let html = '<h2>🎲 Хто ходить першим?</h2>';

  for (const p of state.players) {
    const roll = state.orderRolls ? state.orderRolls[p.id] : null;
    const isCurrentRoller = state.orderRollCurrentId === p.id;
    const color = PLAYER_COLORS[state.players.indexOf(p)] || '#888';

    html += `<div class="ro-player-row ${isCurrentRoller ? 'current' : ''}">`;
    html += `<div class="ro-player-avatar" style="background:${color}">${p.name[0]}</div>`;
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
    html += `<button id="btn-order-roll" class="btn btn-roll ro-roll-btn">🎲 КИНУТИ КУБИКИ</button>`;
  }

  panel.innerHTML = html;

  // Bind roll button
  const rollBtn = document.getElementById('btn-order-roll');
  if (rollBtn) {
    rollBtn.addEventListener('click', () => {
      rollBtn.disabled = true;
      rollBtn.textContent = '🎲 Кидаю...';
      SFX.diceRoll();
      socket.emit('rollForOrder', {}, (res) => {
        if (res.error) {
          alert(res.error);
          rollBtn.disabled = false;
          rollBtn.textContent = '🎲 КИНУТИ КУБИКИ';
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
      slot.innerHTML = `
        <div class="avatar" style="background:${PLAYER_COLORS[i]}">${p.name[0].toUpperCase()}</div>
        <div class="pname">${p.name}</div>
      `;
    } else {
      slot.innerHTML = '<div style="color:var(--text-muted);font-size:24px">+</div><div class="pname" style="color:var(--text-muted)">Очікує...</div>';
    }
    list.appendChild(slot);
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
        tokens.forEach((p, i) => {
          const token = document.createElement('div');
          token.className = 'player-token';
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
          bomb.innerHTML = `<svg viewBox="0 0 64 64" width="18" height="18">
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

    // District color bar
    const distBar = document.createElement('div');
    distBar.className = 'district-bar';
    distBar.style.background = district.color;
    cell.appendChild(distBar);

    // Owner bar (opposite side)
    if (owner) {
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
    <div class="ci-title">${title}</div>
    <div class="ci-text">${text}</div>
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
function showCenterPanel(title, description, buttons) {
  const panel = $('#center-panel');
  let html = '';
  if (title) html += `<h3>${title}</h3>`;
  if (description) html += `<p>${description}</p>`;
  html += '<div class="center-buttons">';
  // buttons rendered after innerHTML set
  panel.innerHTML = html + '</div>';
  const btnContainer = panel.querySelector('.center-buttons');
  for (const btn of buttons) {
    const el = document.createElement('button');
    el.className = `btn ${btn.cls || 'btn-primary'}`;
    el.textContent = btn.text;
    el.addEventListener('click', () => {
      btn.action();
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
      <div class="jackpot-crown">👑</div>
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
  SFX.cardFlip();
  SFX.cardReveal();
  cardRevealActive = true;
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
          const front = card.querySelector('.hh-card-front-name');
          const desc = card.querySelector('.hh-card-front-desc');
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
  text.innerHTML = `<h1>💥 ВИБУХ!</h1><p>${playerName} підірвався на бомбі!</p>`;
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
      ? p.helpers.map(h => `<div class="helper-card"><div class="hc-name">${h.name}</div><div class="hc-desc">${h.description}</div></div>`).join('')
      : (p.helperCount > 0 ? `<div class="helper-card"><div class="hc-name">\uD83D\uDC64 Помічники: ${p.helperCount}</div></div>` : '');

    panel.innerHTML = `
      <div class="pp-header">
        <div class="pp-avatar" style="background:${p.character.color}">${p.name[0]}</div>
        <div class="pp-info">
          <div class="pp-name">${p.name} ${isCurrent ? '◀' : ''} ${p.id === myId ? '(Ви)' : ''}</div>
          <div class="pp-respect">${p.respectName} (Lv.${p.respectLevel})</div>
        </div>
        <div class="pp-money">${p.money}$</div>
      </div>
      <div class="pp-details">
        ${p.inPrison > 0 ? `<span class="pp-tag prison">⛓ ${p.inPrison} ходів</span>` : ''}
        <span class="pp-tag cards">🃏 ${p.mafiaCardCount}</span>
        <span class="pp-tag">🏢 ${p.businessCount}</span>
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
      helpersHtml += `
        <div class="ppr-helper">
          <div class="ppr-helper-name">${h.name}</div>
          <div class="ppr-helper-desc">${h.description}</div>
        </div>
      `;
    }
  } else if (!isMe && player.helperCount > 0) {
    helpersHtml = `<div class="ppr-helper"><div class="ppr-helper-name">Помічників: ${player.helperCount}</div><div class="ppr-helper-desc">Деталі приховані</div></div>`;
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
        <div class="pp-big-avatar" style="background:${player.character.color}">${player.name[0]}</div>
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
    const roundInfo = state.currentRound ? ` · Коло ${state.currentRound}` : '';
    $('#turn-info').innerHTML = `Хід ${state.turnNumber}: <span class="current-player">${current.name}</span>${roundInfo}`;
  }
  // Show/hide surrender button
  const surrenderBtn = $('#btn-surrender');
  if (surrenderBtn) {
    surrenderBtn.style.display = (me && me.alive && state.phase === 'playing') ? '' : 'none';
  }
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
      const btn = createActionBtn('⬆ Підвищити повагу', () => {
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
        const btn = createActionBtn('★ Купити вплив (Поллак)', () => {
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
      const btn = createActionBtn('🐕 Скажений Пес (Засідка)', () => {
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

    const endBtn = createActionBtn('✅ Завершити хід', () => {
      SFX.click();
      socket.emit('endTurn', {}, handleResult);
    }, 'btn-secondary');
    actionBtns.appendChild(endBtn);

    // Surrender button moved to topbar
  }

  if (isMyTurn && me && me.inPrison > 0 && state.turnPhase === 'roll') {
    btnRoll.disabled = false;
    btnRoll.textContent = `⛓ У в'язниці (${me.inPrison})`;
    if (me.mafiaCards && me.mafiaCards.some(c => c.id === 'lawyer')) {
      const btn = createActionBtn('📜 Використати Адвоката', () => {
        SFX.buy();
        socket.emit('playMafiaCard', { cardId: 'lawyer' }, handleResult);
      });
      actionBtns.appendChild(btn);
    }
  }
}

function createActionBtn(text, onClick, extraClass = '') {
  const btn = document.createElement('button');
  btn.className = `btn ${extraClass || 'btn-primary'}`;
  btn.textContent = text;
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
      ${locked ? `<div class="mc-locked">🔒 з ${state.mafiaCardMinRound}-го кола</div>` : ''}
    `;
    el.addEventListener('click', () => onMafiaCardClick(card, state));
    list.appendChild(el);
  }
}

function onMafiaCardClick(card, state) {
  const isMyTurn = state.currentPlayerId === myId;
  if (!isMyTurn || state.turnPhase !== 'action') return;

  // Check round lock for attack cards
  if (card.type === 'attack' && state.currentRound < state.mafiaCardMinRound) {
    showEventDisplay(`<p style="color:var(--red-light)">🔒 Карти атаки доступні з ${state.mafiaCardMinRound}-го кола! (зараз коло ${state.currentRound})</p>`, 2500);
    return;
  }

  SFX.mafia();

  if (card.type === 'attack' || card.id === 'rumors' || card.id === 'kompromat') {
    showTargetSelectionModal(card, state);
  } else if (card.id === 'bomb') {
    socket.emit('playMafiaCard', { cardId: 'bomb' }, handleResult);
  } else if (card.id === 'lawyer') {
    socket.emit('playMafiaCard', { cardId: 'lawyer' }, handleResult);
  } else if (card.id === 'confession') {
    showCenterPanel('Явка з повинною', "Вирушити у в'язницю на 1 хід?", [
      { text: 'Так', action: () => { socket.emit('playMafiaCard', { cardId: 'confession' }, handleResult); hideCenterPanel(); } },
      { text: 'Скасувати', action: hideCenterPanel, cls: 'btn-secondary' }
    ]);
  } else if (card.id === 'raider' || card.id === 'pogrom') {
    socket.emit('playMafiaCard', { cardId: card.id }, handleResult);
  }
}

// ===== DICE =====
$('#btn-roll').addEventListener('click', () => {
  SFX.diceRoll();
  hideEventDisplay();
  socket.emit('rollDice', {}, (res) => {
    if (res.error) return alert(res.error);
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
              confirmedPendingId = 'mafia_confirm';
              socket.emit('resolveAction', { actionType: 'mafia_confirm', data: {} }, handleResult);
            });
        }, animDelay);
      } else if (lr.type === 'event' && lr.card) {
        setTimeout(() => {
          showCardReveal('event', 'ПОДІЯ', lr.card.name, lr.card.description, () => {
            confirmedPendingId = 'event_confirm';
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
    return;
  }
  // Clear confirmedPendingId if the pending action type changed (new action appeared)
  if (confirmedPendingId && action.type !== confirmedPendingId) {
    confirmedPendingId = null;
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
        `🔒 ${action.ownerName} у в'язниці!`,
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
          text: '🔫 Пограбувати!', action: () => {
            SFX.attack();
            socket.emit('resolveAction', { actionType: 'pay_rent', data: { useRobbery: true } }, handleResult);
            hideCenterPanel();
          }, cls: 'btn-danger'
        }] : []),
        ...(action.canBuyout ? [{
          text: `🏢 Викупити (${action.buyoutPrice}$)`, action: () => {
            SFX.buy();
            socket.emit('resolveAction', { actionType: 'buyout_business', data: { businessId: action.businessId } }, handleResult);
            hideCenterPanel();
          }, cls: 'btn-casino'
        }] : [])
      ]);
      break;

    case 'police_landing_choice':
      SFX.event();
      showCenterPanel('👮 Поліція', 'Оберіть дію:', action.choices.map(c => ({
        text: c.label,
        action: () => {
          SFX.buy();
          socket.emit('resolveAction', { actionType: 'police_choice', data: { choiceId: c.id } }, handleResult);
          hideCenterPanel();
        },
        cls: c.id.startsWith('snitch_') ? 'btn-danger' : ''
      })));
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
      showCenterPanel('💣 Вибух бомби!', 'Оберіть помічника, який загине:', me.helpers.map((h, i) => ({
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
        showCenterPanel('Оберіть ціль', `Який помічник ${targetP ? targetP.name : 'ворога'} загине?`, helpersList.map((h, i) => ({
          text: h.name,
          action: () => {
            socket.emit('resolveAction', { actionType: 'choose_kill_helper', data: { attackerId: action.attackerId, targetId: action.targetId, helperIndex: i } }, handleResult);
            hideCenterPanel();
          }
        })));
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

    case 'mafia_confirm':
      if (confirmedPendingId === 'mafia_confirm') break; // already confirmed, skip re-show
      if (action.playerId === myId && action.cards && action.cards.length > 0) {
        showCardReveal('mafia', 'КАРТА MAFIA', action.cards.map(c => c.name).join(', '),
          action.cards.map(c => c.description).join('\n'), () => {
            confirmedPendingId = 'mafia_confirm';
            socket.emit('resolveAction', { actionType: 'mafia_confirm', data: {} }, handleResult);
          });
      }
      break;

    case 'event_confirm':
      if (confirmedPendingId === 'event_confirm') break; // already confirmed, skip re-show
      if (action.playerId === myId && action.card) {
        showCardReveal('event', 'ПОДІЯ', action.card.name, action.card.description, () => {
          confirmedPendingId = 'event_confirm';
          socket.emit('resolveAction', { actionType: 'event_confirm', data: {} }, handleResult);
        });
      }
      break;

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
      showAuctionModal(action, state);
      break;
    }
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
      el.addEventListener('click', btn.action);
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
          }
        });
      } : null,
      cls: canTarget ? 'btn-danger' : 'btn-disabled',
      disabled: !canTarget
    };
  }).concat([{ text: 'Скасувати', action: hideModal, cls: 'btn-secondary' }]);

  showModal(`🔫 ${card.name}`, desc, buttons);
}

function showAuctionModal(action, state) {
  showModal(`🏢 Аукціон: ${action.businessName}`, `Мінімальна ціна: ${action.minPrice}$`, [
    { text: 'Зробити ставку', action: () => {
      const amount = prompt(`Ваша ставка (мін ${action.minPrice}$):`, action.minPrice);
      if (amount && parseInt(amount) >= action.minPrice) {
        SFX.buy();
        socket.emit('auctionBid', { amount: parseInt(amount) }, handleResult);
      }
    }},
    { text: 'Пропустити', action: () => {
      socket.emit('auctionBid', { amount: 0 }, handleResult);
      hideModal();
    }, cls: 'btn-secondary' }
  ]);
}

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
    btn.textContent = '🛡 Бронежилет';
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
    btn.textContent = '👮 Поліція';
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
    btn.textContent = `💰 Відкупитись (${data.buyOffCost}$)`;
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

  const bets = $('#casino-bets');
  bets.innerHTML = '';
  const betTypes = [
    { id: 'red', label: '🔴 Червоне', cls: 'red' },
    { id: 'black', label: '⚫ Чорне', cls: 'black' },
    { id: 'jackpot', label: '👑 JACKPOT', cls: 'green' }
  ];
  for (const bt of betTypes) {
    const el = document.createElement('div');
    el.className = `casino-bet ${bt.cls}`;
    el.textContent = bt.label;
    el.addEventListener('click', () => {
      SFX.click();
      $$('.casino-bet').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
      selectedBetType = bt.id;
    });
    bets.appendChild(el);
  }

  const slider = $('#bet-amount');
  const display = $('#bet-display');
  slider.oninput = () => { display.textContent = slider.value + '$'; };
}

$('#btn-spin').addEventListener('click', () => {
  if (!selectedBetType) return alert('Оберіть тип ставки!');
  const betAmount = parseInt($('#bet-amount').value);
  $('#btn-spin').disabled = true;
  SFX.casino();

  const wheel = $('#roulette-wheel');

  socket.emit('resolveAction', {
    actionType: 'casino',
    data: { betType: selectedBetType, betAmount }
  }, (res) => {
    // Calculate target rotation based on server result
    // Wheel has 37 sectors (0-36), each = 360/37 ≈ 9.73 degrees
    // Red numbers: 1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36
    // Green: 0. Rest: black.
    // Spin to land on the correct color zone
    const spinResult = res.spinResult !== undefined ? res.spinResult : 0;
    const sectorAngle = 360 / 37;
    // We want the marker (at top) to point at the spinResult sector
    // Sector 0 is at top (0 deg). Sector N is at N * sectorAngle clockwise.
    // To point marker at sector N, rotate wheel by -(N * sectorAngle) + full spins
    const targetAngle = -(spinResult * sectorAngle);
    const fullSpins = 1440 + Math.floor(Math.random() * 720);
    const finalRotation = fullSpins + targetAngle;
    wheel.style.transform = `rotate(${finalRotation}deg)`;

    setTimeout(() => {
      const resultEl = $('#casino-result');
      if (res.error) {
        resultEl.textContent = res.error;
        resultEl.className = 'casino-result lose';
        $('#btn-spin').disabled = false;
        return;
      }
      // Determine color for display
      const redNums = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
      let colorName = spinResult === 0 ? '🟢 Зелене (0)' : (redNums.includes(spinResult) ? '🔴 Червоне' : '⚫ Чорне');

      if (res.type === 'jackpot') {
        SFX.jackpot();
        resultEl.textContent = '👑 MAFIA JACKPOT! 👑';
        resultEl.className = 'casino-result jackpot';
      } else if (res.won) {
        SFX.win();
        resultEl.textContent = `${colorName} — Виграш +${res.winnings}$`;
        resultEl.className = 'casino-result win';
      } else {
        SFX.lose();
        resultEl.textContent = `${colorName} — Програш -${res.lost}$`;
        resultEl.className = 'casino-result lose';
      }
      $('#btn-casino-close').style.display = 'inline-block';
    }, 3500);
  });
});

$('#btn-casino-close').addEventListener('click', () => {
  SFX.click();
  $('#casino-overlay').classList.remove('active');
  const wheel = $('#roulette-wheel');
  wheel.style.transition = 'none';
  wheel.style.transform = 'rotate(0deg)';
  setTimeout(() => { wheel.style.transition = 'transform 3s cubic-bezier(0.2, 0.8, 0.3, 1)'; }, 50);
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

// ===== CHEAT/DEBUG PANEL =====
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
    { id: 'confession', name: 'Явка з повинною', type: 'utility' },
    { id: 'bribe_inmates', name: 'Підкуп співкамерників', type: 'attack' },
    { id: 'rumors', name: 'Розпустити чутки', type: 'utility' },
    { id: 'police_card', name: 'Поліція', type: 'defense' },
    { id: 'kompromat', name: 'Компромат', type: 'utility' },
    { id: 'bomb', name: 'Бомба', type: 'trap' },
    { id: 'lucky_shirt', name: 'Народжений у сорочці', type: 'defense' }
  ];

  const CHEAT_HELPERS = [
    { id: 'stanley_pollak', name: 'Стенлі Поллак', ability: 'buyInfluenceAnywhere' },
    { id: 'whitey_ross', name: '«Уайті» Росс', ability: 'cheaperAttacks' },
    { id: 'mad_dog', name: '«Скажений Пес»', ability: 'freeAmbush' },
    { id: 'lenny_pike', name: 'Ленні «Щука»', ability: 'bonusOnNonMafia' },
    { id: 'leo_acrobat', name: 'Лео «Акробат»', ability: 'earlyRelease' },
    { id: 'willie_ruthless', name: 'Віллі «Безжалісний»', ability: 'robOnKill' },
    { id: 'tony_fox', name: 'Тоні «Лис»', ability: 'influenceOnKill' },
    { id: 'capo_corrado', name: 'Капо Коррадо', ability: 'extraStep' },
    { id: 'mickey_renegade', name: 'Міккі «Відступник»', ability: 'noBribe' },
    { id: 'baby_flemmi', name: 'Малюк Флеммі', ability: 'counterAttack' },
    { id: 'tommy_morello', name: 'Томмі Морелло', ability: 'cheaperRespect' },
    { id: 'nikki_king', name: 'Ніккі «Король»', ability: 'doubleMafia' },
    { id: 'survivor_joe', name: 'Живучий Джо', ability: 'surviveOnce' },
    { id: 'steel_ronnie', name: '«Сталевий» Ронні', ability: 'noBuyOff' },
    { id: 'donnie_angelo', name: 'Донні Анджело', ability: 'cheaperInfluence' },
    { id: 'marco_player', name: 'Марко «Гравець»', ability: 'barBonus' }
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

  // Keyboard shortcut: backtick toggles cheat panel
  document.addEventListener('keydown', (e) => {
    if (e.key === '`' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // Don't toggle if typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      toggleCheatPanel();
    }
  });
})();

// ===== UTILITY =====
function handleResult(res) {
  if (res && res.error) {
    console.warn(res.error);
    showEventDisplay(`<p style="color:var(--red-light)">${res.error}</p>`, 2000);
  }
}
