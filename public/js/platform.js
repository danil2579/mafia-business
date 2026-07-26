(() => {
  'use strict';

  const STORAGE_KEY = 'mb_product_settings_v1';
  const dictionaries = {
    uk: {
      account: 'Акаунт', settings: 'Налаштування', signIn: 'Увійти', register: 'Реєстрація', logout: 'Вийти',
      guest: 'Грати без акаунта', identity: 'Ім’я або email', username: 'Ім’я гравця', email: 'Email', password: 'Пароль',
      createAccount: 'Створити акаунт', welcome: 'Профіль гравця', accountHint: 'Акаунт захищає ім’я та зберігає налаштування.',
      language: 'Мова', music: 'Фонова музика', sfx: 'Звукові ефекти', volume: 'Гучність', reduceMotion: 'Менше анімацій',
      install: 'Встановити гру', installHint: 'Встановіть як застосунок на ноутбук або телефон.', close: 'Закрити', save: 'Збережено',
      chooseMode: 'ОБЕРІТЬ РЕЖИМ', classic: 'Класична гра', classicDesc: 'Кожен грає зі свого пристрою',
      tvMode: 'TV Режим', tvDesc: 'Великий екран + телефони як контролери', players: '2–8 ГРАВЦІВ', strategy: 'СТРАТЕГІЯ', online: 'ОНЛАЙН',
      tagline: 'Нічого особистого. Тільки бізнес.', playerName: 'ІМ’Я ГРАВЦЯ', playerPlaceholder: 'Введіть ваше ім’я',
      createRoom: 'Створити кімнату', or: 'АБО', roomCode: 'Код кімнати', enter: 'Увійти', findRoom: 'Знайти кімнату', back: '← Назад', rules: 'ПРАВИЛА',
      staging: 'КІМНАТА ОЧІКУВАННЯ', room: 'Кімната:', shareCode: 'Поділіться кодом із друзями та зберіть свою сім’ю перед початком гри',
      roomPlayers: 'Гравці у кімнаті', chooseCharacter: 'ОБЕРІТЬ ПЕРСОНАЖА', gameSettings: 'Налаштування гри', attackRound: 'Карти атаки доступні з кола:',
      addBot: 'Додати бота', startGame: 'Почати гру', waitingPlayers: 'Очікуємо гравців…', minimumPlayers: 'Потрібно мінімум 2 гравці…', ready: 'Готово до початку!', emptySlot: 'Очікує…', noRooms: 'Немає відкритих кімнат', capital: 'КАПІТАЛ', chat: 'ЧАТ'
    },
    ru: {
      account: 'Аккаунт', settings: 'Настройки', signIn: 'Войти', register: 'Регистрация', logout: 'Выйти',
      guest: 'Играть без аккаунта', identity: 'Имя или email', username: 'Имя игрока', email: 'Email', password: 'Пароль',
      createAccount: 'Создать аккаунт', welcome: 'Профиль игрока', accountHint: 'Аккаунт защищает имя и сохраняет настройки.',
      language: 'Язык', music: 'Фоновая музыка', sfx: 'Звуковые эффекты', volume: 'Громкость', reduceMotion: 'Меньше анимаций',
      install: 'Установить игру', installHint: 'Установите как приложение на ноутбук или телефон.', close: 'Закрыть', save: 'Сохранено',
      chooseMode: 'ВЫБЕРИТЕ РЕЖИМ', classic: 'Классическая игра', classicDesc: 'Каждый играет со своего устройства',
      tvMode: 'TV Режим', tvDesc: 'Большой экран + телефоны как контроллеры', players: '2–8 ИГРОКОВ', strategy: 'СТРАТЕГИЯ', online: 'ОНЛАЙН',
      tagline: 'Ничего личного. Только бизнес.', playerName: 'ИМЯ ИГРОКА', playerPlaceholder: 'Введите ваше имя',
      createRoom: 'Создать комнату', or: 'ИЛИ', roomCode: 'Код комнаты', enter: 'Войти', findRoom: 'Найти комнату', back: '← Назад', rules: 'ПРАВИЛА',
      staging: 'КОМНАТА ОЖИДАНИЯ', room: 'Комната:', shareCode: 'Поделитесь кодом с друзьями и соберите свою семью перед началом игры',
      roomPlayers: 'Игроки в комнате', chooseCharacter: 'ВЫБЕРИТЕ ПЕРСОНАЖА', gameSettings: 'Настройки игры', attackRound: 'Карты атаки доступны с круга:',
      addBot: 'Добавить бота', startGame: 'Начать игру', waitingPlayers: 'Ожидаем игроков…', minimumPlayers: 'Нужно минимум 2 игрока…', ready: 'Можно начинать!', emptySlot: 'Ожидает…', noRooms: 'Нет открытых комнат', capital: 'КАПИТАЛ', chat: 'ЧАТ'
    },
    en: {
      account: 'Account', settings: 'Settings', signIn: 'Sign in', register: 'Register', logout: 'Sign out',
      guest: 'Play as guest', identity: 'Name or email', username: 'Player name', email: 'Email', password: 'Password',
      createAccount: 'Create account', welcome: 'Player profile', accountHint: 'An account protects your name and syncs preferences.',
      language: 'Language', music: 'Background music', sfx: 'Sound effects', volume: 'Volume', reduceMotion: 'Reduce motion',
      install: 'Install game', installHint: 'Install the game as an app on your laptop or phone.', close: 'Close', save: 'Saved',
      chooseMode: 'CHOOSE A MODE', classic: 'Classic game', classicDesc: 'Every player uses their own device',
      tvMode: 'TV Mode', tvDesc: 'Big screen + phones as controllers', players: '2–8 PLAYERS', strategy: 'STRATEGY', online: 'ONLINE',
      tagline: 'Nothing personal. Just business.', playerName: 'PLAYER NAME', playerPlaceholder: 'Enter your name',
      createRoom: 'Create room', or: 'OR', roomCode: 'Room code', enter: 'Join', findRoom: 'Find a room', back: '← Back', rules: 'RULES',
      staging: 'STAGING ROOM', room: 'Room:', shareCode: 'Share the code with friends and gather your family before the match',
      roomPlayers: 'Players in room', chooseCharacter: 'CHOOSE A CHARACTER', gameSettings: 'Game settings', attackRound: 'Attack cards unlock on round:',
      addBot: 'Add bot', startGame: 'Start game', waitingPlayers: 'Waiting for players…', minimumPlayers: 'At least 2 players are required…', ready: 'Ready to start!', emptySlot: 'Waiting…', noRooms: 'No open rooms', capital: 'CAPITAL', chat: 'CHAT'
    }
  };

  function loadSettings() {
    const browserLanguage = (navigator.language || 'uk').slice(0, 2);
    const defaults = {
      language: dictionaries[browserLanguage] ? browserLanguage : 'uk',
      music: localStorage.getItem('mafia_music') === 'on',
      sfx: true,
      volume: 70,
      reduceMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
    };
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return { ...defaults, ...stored, language: dictionaries[stored.language] ? stored.language : defaults.language };
    } catch (_) {
      return defaults;
    }
  }

  const state = { settings: loadSettings(), account: null, installPrompt: null };

  function t(key) {
    return dictionaries[state.settings.language]?.[key] || dictionaries.uk[key] || key;
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
    localStorage.setItem('mafia_music', state.settings.music ? 'on' : 'off');
  }

  function applyTranslations(root = document) {
    document.documentElement.lang = state.settings.language;
    root.querySelectorAll('[data-i18n]').forEach(element => {
      element.textContent = t(element.dataset.i18n);
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
      element.placeholder = t(element.dataset.i18nPlaceholder);
    });
    root.querySelectorAll('[data-i18n-title]').forEach(element => {
      element.title = t(element.dataset.i18nTitle);
    });
    root.querySelectorAll('[data-i18n-aria-label]').forEach(element => {
      element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
    });
    document.body?.classList.toggle('reduce-motion', !!state.settings.reduceMotion);
  }

  function openModal(id) {
    document.getElementById(id)?.classList.add('open');
    document.body.classList.add('product-modal-open');
  }

  function closeModal(id) {
    document.getElementById(id)?.classList.remove('open');
    if (!document.querySelector('.product-modal.open')) document.body.classList.remove('product-modal-open');
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Request failed');
    return result;
  }

  function setAuthMessage(message, isError = false) {
    const element = document.getElementById('auth-message');
    if (!element) return;
    element.textContent = message || '';
    element.classList.toggle('error', isError);
  }

  function updateAccountUI() {
    const buttonText = document.getElementById('account-button-text');
    const guestPanel = document.getElementById('auth-guest-panel');
    const signedPanel = document.getElementById('auth-signed-panel');
    if (buttonText) buttonText.textContent = state.account?.username || t('account');
    if (guestPanel) guestPanel.hidden = !!state.account;
    if (signedPanel) signedPanel.hidden = !state.account;
    const name = document.getElementById('account-profile-name');
    const email = document.getElementById('account-profile-email');
    if (name) name.textContent = state.account?.username || '';
    if (email) email.textContent = state.account?.email || '';
    if (state.account?.username) {
      for (const id of ['player-name', 'phone-player-name']) {
        const input = document.getElementById(id);
        if (input && !input.value) input.value = state.account.username;
      }
    }
  }

  function syncSettingsControls() {
    const language = document.getElementById('product-language');
    const music = document.getElementById('product-music');
    const sfx = document.getElementById('product-sfx');
    const volume = document.getElementById('product-volume');
    const motion = document.getElementById('product-motion');
    if (language) language.value = state.settings.language;
    if (music) music.checked = state.settings.music;
    if (sfx) sfx.checked = state.settings.sfx;
    if (volume) volume.value = state.settings.volume;
    if (motion) motion.checked = state.settings.reduceMotion;
    const volumeValue = document.getElementById('product-volume-value');
    if (volumeValue) volumeValue.textContent = `${state.settings.volume}%`;
  }

  function bindUI() {
    document.getElementById('btn-account')?.addEventListener('click', () => openModal('account-modal'));
    document.getElementById('btn-product-settings')?.addEventListener('click', () => {
      syncSettingsControls();
      openModal('settings-modal');
    });
    document.querySelectorAll('[data-close-product-modal]').forEach(button => {
      button.addEventListener('click', () => closeModal(button.dataset.closeProductModal));
    });
    document.querySelectorAll('.product-modal').forEach(modal => {
      modal.addEventListener('click', event => { if (event.target === modal) closeModal(modal.id); });
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      document.querySelectorAll('.product-modal.open').forEach(modal => closeModal(modal.id));
    });

    document.querySelectorAll('[data-auth-tab]').forEach(button => {
      button.addEventListener('click', () => {
        document.querySelectorAll('[data-auth-tab]').forEach(item => item.classList.toggle('active', item === button));
        document.getElementById('login-form').hidden = button.dataset.authTab !== 'login';
        document.getElementById('register-form').hidden = button.dataset.authTab !== 'register';
        setAuthMessage('');
      });
    });

    document.getElementById('login-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      setAuthMessage('');
      const form = event.currentTarget;
      const data = Object.fromEntries(new FormData(form));
      try {
        const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(data) });
        state.account = result.account;
        if (state.account?.preferences?.language && dictionaries[state.account.preferences.language]) {
          state.settings.language = state.account.preferences.language;
          saveSettings();
          applyTranslations();
        }
        updateAccountUI();
        form.reset();
        setAuthMessage(t('save'));
      } catch (error) { setAuthMessage(error.message, true); }
    });

    document.getElementById('register-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      setAuthMessage('');
      const form = event.currentTarget;
      const data = Object.fromEntries(new FormData(form));
      try {
        const result = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(data) });
        state.account = result.account;
        updateAccountUI();
        form.reset();
        setAuthMessage(t('save'));
      } catch (error) { setAuthMessage(error.message, true); }
    });

    document.getElementById('btn-logout')?.addEventListener('click', async () => {
      try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch (_) {}
      state.account = null;
      updateAccountUI();
      setAuthMessage('');
    });

    document.getElementById('product-language')?.addEventListener('change', async event => {
      state.settings.language = dictionaries[event.target.value] ? event.target.value : 'uk';
      saveSettings();
      applyTranslations();
      updateAccountUI();
      if (state.account) {
        try {
          const result = await api('/api/auth/preferences', { method: 'PUT', body: JSON.stringify({ language: state.settings.language }) });
          state.account = result.account;
        } catch (_) {}
      }
    });
    document.getElementById('product-music')?.addEventListener('change', event => {
      state.settings.music = event.target.checked;
      saveSettings();
      if (state.settings.music) {
        window.ensureAudio?.();
        window.startAmbientMusic?.();
      } else {
        window.stopAmbientMusic?.();
      }
      window.updateMusicButton?.();
    });
    document.getElementById('product-sfx')?.addEventListener('change', event => {
      state.settings.sfx = event.target.checked;
      saveSettings();
    });
    document.getElementById('product-volume')?.addEventListener('input', event => {
      state.settings.volume = Math.max(0, Math.min(100, Number(event.target.value) || 0));
      saveSettings();
      syncSettingsControls();
    });
    document.getElementById('product-motion')?.addEventListener('change', event => {
      state.settings.reduceMotion = event.target.checked;
      saveSettings();
      applyTranslations();
    });
    document.getElementById('btn-install-product')?.addEventListener('click', async () => {
      if (state.installPrompt) {
        state.installPrompt.prompt();
        await state.installPrompt.userChoice;
        state.installPrompt = null;
      } else {
        const hint = document.getElementById('install-status');
        if (hint) hint.textContent = /iphone|ipad|ipod/i.test(navigator.userAgent)
          ? 'Safari → Поділитися → На початковий екран'
          : t('installHint');
      }
    });
  }

  async function initialize() {
    const mode = new URLSearchParams(location.search).get('mode');
    const toolbar = document.getElementById('product-toolbar');
    if (toolbar && mode === 'tv') toolbar.hidden = true;
    if (toolbar && mode === 'phone') toolbar.classList.add('compact');
    applyTranslations();
    bindUI();
    syncSettingsControls();
    try {
      const result = await api('/api/auth/me');
      state.account = result.account;
      if (state.account?.preferences?.language && !localStorage.getItem(STORAGE_KEY)) {
        state.settings.language = state.account.preferences.language;
        saveSettings();
        applyTranslations();
      }
    } catch (_) {}
    updateAccountUI();

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    state.installPrompt = event;
    document.getElementById('btn-install-product')?.classList.add('ready');
  });

  window.MBPlatform = {
    state,
    t,
    applyTranslations,
    soundEnabled: () => state.settings.sfx && state.settings.volume > 0,
    volumeScale: () => Math.max(0, Math.min(1, state.settings.volume / 100))
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
