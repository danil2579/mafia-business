// ============================================================
// MAFIA BUSINESS v2 — Game Data (from real board game photos)
// ============================================================

// --- RESPECT LEVELS ---
const RESPECT_LEVELS = [
  {
    level: 1, name: 'Шпана',
    upgradeCost: 0, startBonus: 500, policeBribe: 100,
    maxHelpers: 0, attackDiscount: 0, canBuyOff: false
  },
  {
    level: 2, name: 'Капо',
    upgradeCost: 1000, startBonus: 1000, policeBribe: 200,
    maxHelpers: 1, attackDiscount: 0, canBuyOff: false
  },
  {
    level: 3, name: 'Консільєрі',
    upgradeCost: 2000, startBonus: 2000, policeBribe: 300,
    maxHelpers: 2, attackDiscount: 0, canBuyOff: false
  },
  {
    level: 4, name: 'Молодший Бос',
    upgradeCost: 3000, startBonus: 3000, policeBribe: 400,
    maxHelpers: 2, attackDiscount: 900, canBuyOff: false
  },
  {
    level: 5, name: 'Шляхетний Дон',
    upgradeCost: 4000, startBonus: 4000, policeBribe: 500,
    maxHelpers: 2, attackDiscount: 0, canBuyOff: true
  }
];

// --- DISTRICTS & BUSINESSES (exact data from card photos) ---
const DISTRICTS = [
  {
    id: 'trushchoby', name: 'Трущоби', color: '#4a6741',
    influenceCost: 300,
    businesses: [
      { id: 'kiosk', name: 'Газетний кіоск', price: 900, rent: [400, 900, 1300] },
      { id: 'shawarma', name: 'Шаурмічна', price: 950, rent: [450, 950, 1400] },
      { id: 'lombard', name: 'Ломбард', price: 1000, rent: [500, 1000, 1500] }
    ]
  },
  {
    id: 'ghetto', name: 'Гетто', color: '#8b4513',
    influenceCost: 500,
    businesses: [
      { id: 'avto_moyka', name: 'Автомийка', price: 1100, rent: [550, 1100, 1650] },
      { id: 'barbershop', name: 'Барбершоп', price: 1200, rent: [600, 1200, 1800] },
      { id: 'taksopark', name: 'Таксопарк', price: 1300, rent: [650, 1300, 1950] }
    ]
  },
  {
    id: 'spalniy', name: 'Спальний район', color: '#27ae60',
    influenceCost: 700,
    businesses: [
      { id: 'pitseria', name: 'Піцерія', price: 1400, rent: [700, 1400, 2100] },
      { id: 'apteka', name: 'Аптека', price: 1500, rent: [750, 1500, 2250] },
      { id: 'supermarket', name: 'Супермаркет', price: 1600, rent: [800, 1600, 2400] }
    ]
  },
  {
    id: 'promzona', name: 'Промзона', color: '#7f8c8d',
    influenceCost: 900,
    businesses: [
      { id: 'avtoservis', name: 'Автосервіс', price: 1700, rent: [850, 1700, 2550] },
      { id: 'sklad', name: 'Склад контрабанди', price: 1800, rent: [900, 1800, 2700] },
      { id: 'drukarnya', name: 'Друкарня грошей', price: 1900, rent: [950, 1900, 2850] }
    ]
  },
  {
    id: 'elitnyy', name: 'Елітний район', color: '#3498db',
    influenceCost: 1100,
    businesses: [
      { id: 'avtosalon', name: 'Автосалон', price: 2000, rent: [1000, 2000, 3000] },
      { id: 'hotel', name: 'Готель', price: 2050, rent: [1050, 2050, 3100] },
      { id: 'telestudiya', name: 'Телестудія', price: 2100, rent: [1100, 2100, 3200] }
    ]
  },
  {
    id: 'turystychnyy', name: 'Туристичний центр', color: '#e67e22',
    influenceCost: 1300,
    businesses: [
      { id: 'spa', name: 'Спа-центр', price: 2200, rent: [1100, 2200, 3300] },
      { id: 'restoran', name: 'Ресторан', price: 2300, rent: [1150, 2300, 3450] },
      { id: 'yacht_club', name: 'Яхт-клуб', price: 2400, rent: [1200, 2400, 3600] }
    ]
  },
  {
    id: 'red_light', name: 'Район Червоних Ліхтарів', color: '#c0392b',
    influenceCost: 1500,
    businesses: [
      { id: 'night_club', name: 'Нічний клуб', price: 2500, rent: [1250, 2500, 3800] },
      { id: 'lounge_bar', name: 'Лаунж-бар', price: 2600, rent: [1300, 2600, 3900] },
      { id: 'casino', name: 'Казино Рояль', price: 2700, rent: [1350, 2700, 4050] }
    ]
  },
  {
    id: 'dilovyy', name: 'Діловий квартал', color: '#8e44ad',
    influenceCost: 1700,
    businesses: [
      { id: 'bank', name: 'Банк', price: 2800, rent: [1400, 2800, 4200] },
      { id: 'hedge_fund', name: 'Хедж-фонд', price: 2900, rent: [1450, 2900, 4350] },
      { id: 'skyscraper', name: 'Хмарочос', price: 3000, rent: [1500, 3000, 4500] }
    ]
  }
];

// --- BOARD LAYOUT (36 sectors, exact order from board game) ---
// Clockwise from START (bottom-left corner)
// Left column (bottom→top): START → BAR
// Top row (left→right): BAR → POLICE
// Right column (top→bottom): POLICE → PRISON
// Bottom row (right→left): PRISON → START
const BOARD = [
  // LEFT COLUMN (bottom to top): sectors 0-11
  { index: 0,  type: 'START', name: 'START' },
  { index: 1,  type: 'EVENT', name: 'ПОДІЯ' },
  { index: 2,  type: 'business', districtId: 'trushchoby', businessIndex: 0 },  // Смітник 900$
  { index: 3,  type: 'business', districtId: 'trushchoby', businessIndex: 1 },  // Секонд хенди 950$
  { index: 4,  type: 'business', districtId: 'trushchoby', businessIndex: 2 },  // Забігайлівки 1000$
  { index: 5,  type: 'MAFIA', name: 'MAFIA' },
  { index: 6,  type: 'EVENT', name: 'ПОДІЯ' },
  { index: 7,  type: 'business', districtId: 'ghetto', businessIndex: 0 },      // Ринок 1100$
  { index: 8,  type: 'business', districtId: 'ghetto', businessIndex: 1 },      // Пральні 1200$
  { index: 9,  type: 'business', districtId: 'ghetto', businessIndex: 2 },      // Транспорт 1300$
  { index: 10, type: 'MAFIA', name: 'MAFIA' },
  { index: 11, type: 'BAR', name: 'BAR' },

  // TOP ROW (left to right): sectors 12-18
  { index: 12, type: 'business', districtId: 'spalniy', businessIndex: 0 },     // Кафе 1400$
  { index: 13, type: 'business', districtId: 'spalniy', businessIndex: 1 },     // Телефонна станція 1500$
  { index: 14, type: 'business', districtId: 'spalniy', businessIndex: 2 },     // Магазини 1600$
  { index: 15, type: 'business', districtId: 'promzona', businessIndex: 0 },    // Склади 1700$
  { index: 16, type: 'business', districtId: 'promzona', businessIndex: 1 },    // Бутлегери 1800$
  { index: 17, type: 'business', districtId: 'promzona', businessIndex: 2 },    // Фальшивомонетники 1900$
  { index: 18, type: 'POLICE', name: 'ПОЛІЦІЯ' },

  // RIGHT COLUMN (top to bottom): sectors 19-29
  { index: 19, type: 'EVENT', name: 'ПОДІЯ' },
  { index: 20, type: 'business', districtId: 'elitnyy', businessIndex: 0 },     // Торгові центри 2000$
  { index: 21, type: 'business', districtId: 'elitnyy', businessIndex: 1 },     // Автозаправки 2050$
  { index: 22, type: 'business', districtId: 'elitnyy', businessIndex: 2 },     // Радіостанція 2100$
  { index: 23, type: 'MAFIA', name: 'MAFIA' },
  { index: 24, type: 'EVENT', name: 'ПОДІЯ' },
  { index: 25, type: 'business', districtId: 'turystychnyy', businessIndex: 0 }, // Сувенірні лавки 2200$
  { index: 26, type: 'business', districtId: 'turystychnyy', businessIndex: 1 }, // Ресторани 2300$
  { index: 27, type: 'business', districtId: 'turystychnyy', businessIndex: 2 }, // Пам'ятники архітектури 2400$
  { index: 28, type: 'MAFIA', name: 'MAFIA' },
  { index: 29, type: 'PRISON', name: "В'ЯЗНИЦЯ" },

  // BOTTOM ROW (right to left): sectors 30-35
  { index: 30, type: 'business', districtId: 'red_light', businessIndex: 0 },    // Клуби 2500$
  { index: 31, type: 'business', districtId: 'red_light', businessIndex: 1 },    // Масажні салони 2600$
  { index: 32, type: 'business', districtId: 'red_light', businessIndex: 2 },    // Казино 2700$
  { index: 33, type: 'business', districtId: 'dilovyy', businessIndex: 0 },      // Банки 2800$
  { index: 34, type: 'business', districtId: 'dilovyy', businessIndex: 1 },      // Біржа 2900$
  { index: 35, type: 'business', districtId: 'dilovyy', businessIndex: 2 }       // Суд 3000$
];

// District → sector indices
const DISTRICT_SECTORS = {
  trushchoby:   [2, 3, 4],
  ghetto:       [7, 8, 9],
  spalniy:      [12, 13, 14],
  promzona:     [15, 16, 17],
  elitnyy:      [20, 21, 22],
  turystychnyy: [25, 26, 27],
  red_light:    [30, 31, 32],
  dilovyy:      [33, 34, 35]
};

// --- BOARD GRID POSITIONS for visual rendering ---
// Grid: 8 rows × 12 cols (landscape, rotated 90° CW so START is top-left)
// Corners: START(0) at row1/col1, BAR(11) at row1/col12, POLICE(18) at row8/col12, PRISON(29) at row8/col1
const BOARD_GRID = {
  // Top row (row 1, left to right): sectors 0-11
  0:  { row: 1, col: 1 },   // START
  1:  { row: 1, col: 2 },   // ПОДІЯ
  2:  { row: 1, col: 3 },   // Смітник
  3:  { row: 1, col: 4 },   // Секонд хенди
  4:  { row: 1, col: 5 },   // Забігайлівки
  5:  { row: 1, col: 6 },   // MAFIA
  6:  { row: 1, col: 7 },   // ПОДІЯ
  7:  { row: 1, col: 8 },   // Ринок
  8:  { row: 1, col: 9 },   // Пральні
  9:  { row: 1, col: 10 },  // Транспорт
  10: { row: 1, col: 11 },  // MAFIA
  11: { row: 1, col: 12 },  // BAR

  // Right column (col 12, top to bottom): sectors 12-18
  12: { row: 2, col: 12 },  // Кафе
  13: { row: 3, col: 12 },  // Телефонна станція
  14: { row: 4, col: 12 },  // Магазини
  15: { row: 5, col: 12 },  // Склади
  16: { row: 6, col: 12 },  // Бутлегери
  17: { row: 7, col: 12 },  // Фальшивомонетники
  18: { row: 8, col: 12 },  // POLICE

  // Bottom row (row 8, right to left): sectors 19-29
  19: { row: 8, col: 11 },  // ПОДІЯ
  20: { row: 8, col: 10 },  // Торгові центри
  21: { row: 8, col: 9 },   // Автозаправки
  22: { row: 8, col: 8 },   // Радіостанція
  23: { row: 8, col: 7 },   // MAFIA
  24: { row: 8, col: 6 },   // ПОДІЯ
  25: { row: 8, col: 5 },   // Сувенірні лавки
  26: { row: 8, col: 4 },   // Ресторани
  27: { row: 8, col: 3 },   // Пам'ятники архітектури
  28: { row: 8, col: 2 },   // MAFIA
  29: { row: 8, col: 1 },   // PRISON

  // Left column (col 1, bottom to top): sectors 30-35
  30: { row: 7, col: 1 },   // Клуби
  31: { row: 6, col: 1 },   // Масажні салони
  32: { row: 5, col: 1 },   // Казино
  33: { row: 4, col: 1 },   // Банки
  34: { row: 3, col: 1 },   // Біржа
  35: { row: 2, col: 1 }    // Суд
};

// --- MAFIA CARDS ---
const MAFIA_CARDS = [
  {
    id: 'sniper', name: 'Снайпер', type: 'attack', cost: 2000,
    description: 'Вбиває на відстані до 5 клітин.',
    range: 5, canDodge: true, canBuyOff: true, canPolice: true
  },
  {
    id: 'robbery', name: 'Пограбування', type: 'economic', cost: 0,
    description: 'Замість плати за бізнес, власник платить вам.',
    canPolice: true
  },
  {
    id: 'raider', name: 'Рейдерське захоплення', type: 'economic', cost: 0,
    description: 'Відбирає бізнес у суперника. Лише після плати.',
    requiresPayFirst: true, canPolice: true
  },
  {
    id: 'massacre', name: 'Бійня', type: 'attack', cost: 1000,
    description: 'Вбиває двох помічників. Потрібно бути в одному районі.',
    requireSameDistrict: true, killsTwo: true,
    canDodge: false, canBuyOff: true, canPolice: true
  },
  {
    id: 'ambush', name: 'Засідка', type: 'attack', cost: 1000,
    description: 'Вбиває ціль, яка знаходиться в тому ж районі або на тій самій клітинці.',
    requireSameDistrict: true, canDodge: true, canBuyOff: true, canPolice: true
  },
  {
    id: 'pogrom', name: 'Погром', type: 'economic', cost: 0,
    description: 'Бізнес повертається у вільний продаж. Лише після плати.',
    requiresPayFirst: true, canPolice: true
  },
  {
    id: 'lawyer', name: 'Адвокат', type: 'utility', cost: 0,
    description: 'Вийти з в\'язниці прямо зараз.'
  },
  {
    id: 'vest', name: 'Бронежилет', type: 'defense', cost: 0,
    description: 'Захищає від снайпера, кілера та засідки.',
    isReaction: true
  },
  {
    id: 'killer', name: 'Кілер', type: 'attack', cost: 3000,
    description: 'Вбиває тихо та на будь-якій відстані.',
    range: Infinity, canDodge: true, canBuyOff: true, canPolice: true
  },
  {
    id: 'poison', name: 'Отрута', type: 'attack', cost: 1000,
    description: 'Вбиває з ймовірністю 50%. Кубик 1-3 = смерть, 4-6 = промах.',
    range: Infinity, probability: true,
    canDodge: false, canBuyOff: false, canPolice: false
  },
  {
    id: 'bribe_inmates', name: 'Підкуп співкамерників', type: 'attack', cost: 1000,
    description: 'Вбивають, доки гравець у в\'язниці.',
    requirePrison: true, canDodge: false, canBuyOff: false, canPolice: false
  },
  {
    id: 'rumors', name: 'Розпустити чутки', type: 'utility', cost: 0,
    description: 'Знижує повагу будь-якого гравця на 1.'
  },
  {
    id: 'police_card', name: 'Поліція', type: 'defense', cost: 0,
    description: 'Відбиває будь-яку кримінальну дію. Винний — у в\'язницю.',
    isReaction: true
  },
  {
    id: 'kompromat', name: 'Компромат', type: 'utility', cost: 0,
    description: 'Відправляє будь-якого гравця у в\'язницю на 2 ходи.'
  },
  {
    id: 'bomb', name: 'Бомба', type: 'trap', cost: 1000,
    description: 'Встановити на секторі. Наступний — вибухне.',
    canDodge: false, canBuyOff: false, canPolice: false
  },
  {
    id: 'lucky_shirt', name: 'Народжений у сорочці', type: 'defense', cost: 0,
    description: 'При підриві бомби ніхто не гине.',
    isReaction: true, defenseAgainst: 'bomb'
  },
  // --- NEW CARDS ---
  {
    id: 'car_bomb', name: 'Автомобільна бомба', type: 'attack', cost: 2500,
    description: 'Вбиває ціль та одного її помічника. Будь-яка відстань.',
    range: Infinity, killsHelper: true,
    canDodge: true, canBuyOff: true, canPolice: true
  },
  {
    id: 'tax_collector', name: 'Збирач данини', type: 'economic', cost: 0,
    description: 'Всі гравці платять вам 500$.'
  },
  {
    id: 'sabotage', name: 'Саботаж', type: 'economic', cost: 0,
    description: 'Знищує 1 рівень впливу на обраному чужому бізнесі.'
  },
  {
    id: 'witness_protection', name: 'Програма захисту свідків', type: 'defense', cost: 0,
    description: 'Наступні 2 ходи вас не можуть атакувати.',
    isReaction: false
  },
  {
    id: 'double_agent', name: 'Подвійний агент', type: 'utility', cost: 0,
    description: 'Вкрадіть одного помічника у обраного гравця.'
  },
  {
    id: 'insurance', name: 'Страховка', type: 'economic', cost: 0,
    description: 'Якщо ви заплатили ренту цей хід, поверніть половину грошей.'
  },
  {
    id: 'blackmail', name: 'Шантаж', type: 'economic', cost: 0,
    description: 'Обраний гравець платить вам 30% своїх грошей.'
  },
  // --- WAVE 2 CARDS ---
  {
    id: 'arson', name: 'Підпал', type: 'attack', cost: 1500,
    description: 'Знищує 1 бізнес суперника (повертає у вільний продаж). Потрібно бути в одному районі.',
    requireSameDistrict: true, canDodge: false, canBuyOff: true, canPolice: true,
    destroysBusiness: true
  },
  {
    id: 'corruption', name: 'Корупція', type: 'utility', cost: 0,
    description: 'На секторі Поліції наступні 3 ходи ви не платите хабар.'
  },
  {
    id: 'money_laundering', name: 'Відмивання грошей', type: 'economic', cost: 0,
    description: 'Подвоюєте дохід з усіх ваших бізнесів на 1 коло.'
  },
  {
    id: 'hostile_takeover', name: 'Вороже поглинання', type: 'economic', cost: 0,
    description: 'Купити чужий бізнес примусово за 1.5× ціни. Гроші йдуть власнику.',
    canPolice: true
  }
];

function buildMafiaDeck() {
  const deck = [];
  const distribution = {
    sniper: 2, robbery: 2, raider: 1, massacre: 1, ambush: 3,
    pogrom: 1, lawyer: 2, vest: 3, killer: 1, poison: 2,
    bribe_inmates: 1, rumors: 2, police_card: 2,
    kompromat: 1, bomb: 2, lucky_shirt: 1,
    car_bomb: 1, tax_collector: 1, sabotage: 2,
    witness_protection: 1, double_agent: 1, insurance: 2, blackmail: 1,
    arson: 1, corruption: 1,
    money_laundering: 1, hostile_takeover: 1
  };
  for (const card of MAFIA_CARDS) {
    const count = distribution[card.id] || 1;
    for (let i = 0; i < count; i++) deck.push({ ...card });
  }
  return deck; // 28 total
}

// --- EVENT CARDS ---
const EVENT_CARDS = [
  // MOVEMENT
  { id: 'ev_bar', name: 'Пропустити стаканчик', category: 'movement',
    description: 'Вирушайте у BAR.', action: 'goToBar' },
  { id: 'ev_start', name: 'Газ на повну', category: 'movement',
    description: 'Перейдіть на сектор START.', action: 'goToStart' },
  { id: 'ev_extra_dice', name: 'Без гальм', category: 'movement',
    description: 'Киньте 1 кубик і перейдіть уперед.', action: 'rollOneForward' },
  { id: 'ev_corner', name: 'Не той поворот', category: 'movement',
    description: 'Перейдіть на найближчий кутовий сектор.', action: 'goToNearestCorner' },
  { id: 'ev_traffic', name: 'Пробка', category: 'movement',
    description: 'Киньте кубик і поверніться назад.', action: 'rollOneBack' },
  // EXPENSES
  { id: 'ev_wick', name: 'Містер Уік', category: 'expense',
    description: 'Заплатіть 3000$ за авто та цуценя.', action: 'pay', amount: 3000 },
  { id: 'ev_accident', name: 'Нещасний випадок', category: 'expense',
    description: 'Помічник загинув. Заберіть 1 помічника.', action: 'loseHelper' },
  { id: 'ev_mole', name: 'Кріт', category: 'expense',
    description: 'Заплатіть 1000$ і заберіть помічника.', action: 'payAndLoseHelper', amount: 1000 },
  { id: 'ev_feds', name: 'Федерали', category: 'expense',
    description: 'Заплатіть 1000$ або в\'язниця на 2 ходи.', action: 'payOrPrison', amount: 1000 },
  { id: 'ev_fire', name: 'Пожежа', category: 'expense',
    description: 'Сплатіть 3000$ для усунення наслідків.', action: 'pay', amount: 3000 },
  { id: 'ev_medical', name: 'Медицина', category: 'expense',
    description: 'Сплатіть 2000$ за лікування.', action: 'pay', amount: 2000 },
  { id: 'ev_troubles', name: 'Тимчасові труднощі', category: 'expense',
    description: 'Скиньте 2 карти MAFIA.', action: 'discardMafia', amount: 2 },
  { id: 'ev_parking', name: 'Непередбачені витрати', category: 'expense',
    description: 'Штраф за паркування 500$.', action: 'pay', amount: 500 },
  { id: 'ev_body', name: 'Тіло у багажнику', category: 'expense',
    description: 'Заплатіть 2000$ щоб знищити докази.', action: 'pay', amount: 2000 },
  { id: 'ev_scandal', name: 'Скандал', category: 'expense',
    description: 'Заплатіть 1000$ для репутації.', action: 'pay', amount: 1000 },
  { id: 'ev_wedding', name: 'Весілля дочки', category: 'expense',
    description: 'Сплатіть 3000$ та всі їдуть у BAR.', action: 'payAndAllToBar', amount: 3000 },
  { id: 'ev_strike', name: 'Страйк', category: 'expense',
    description: 'Заплатіть 1000$ робітникам.', action: 'pay', amount: 1000 },
  // BONUSES
  { id: 'ev_collector', name: 'Колектор', category: 'bonus',
    description: 'Отримайте 2000$.', action: 'receive', amount: 2000 },
  { id: 'ev_retire', name: 'Відхід від справ', category: 'bonus',
    description: 'Отримайте 2000$ і заберіть помічника.', action: 'receiveAndLoseHelper', amount: 2000 },
  { id: 'ev_fed_order', name: 'Федеральне замовлення', category: 'bonus',
    description: 'Скиньте карту замаху, отримайте 3000$.', action: 'discardAttackReceive', amount: 3000 },
  { id: 'ev_connections', name: 'Темні зв\'язки', category: 'bonus',
    description: 'Візьміть 2 карти MAFIA.', action: 'drawMafia', amount: 2 },
  { id: 'ev_birthday', name: 'День народження', category: 'bonus',
    description: 'Кожен гравець дарує 300$.', action: 'birthdayGift', amount: 300 },
  { id: 'ev_ransom', name: 'Заручник', category: 'bonus',
    description: 'Отримайте 4000$.', action: 'receive', amount: 4000 },
  { id: 'ev_influence', name: 'Вплив', category: 'bonus',
    description: 'Додайте 1 фішку впливу безкоштовно.', action: 'freeInfluence' },
  { id: 'ev_jackpot', name: 'Джек-пот', category: 'bonus',
    description: 'Виграш 5000$!', action: 'receive', amount: 5000 },
  { id: 'ev_bank_heist', name: 'Пограбування банку', category: 'bonus',
    description: 'Отримайте 5000$.', action: 'receive', amount: 5000 },
  { id: 'ev_heritage', name: 'Спадщина', category: 'bonus',
    description: 'Отримайте 4000$.', action: 'receive', amount: 4000 },
  { id: 'ev_secret_friend', name: 'Таємний друг', category: 'bonus',
    description: 'Аванс від уряду 1000$.', action: 'receive', amount: 1000 }
];

// --- HELPERS ---
const HELPERS = [
  { id: 'stanley_pollak', name: 'Стенлі Поллак', ability: 'buyInfluenceAnywhere', passive: true,
    description: 'Може купувати вплив у будь-якому районі, навіть у тому, де ви зараз.' },
  { id: 'whitey_ross', name: '«Уайті» Росс', ability: 'ignorePolice', passive: true,
    description: 'Профі: твої атаки не блокуються картою Поліція — тебе не відправляють у в\'язницю.' },
  { id: 'mad_dog', name: '«Скажений Пес»', ability: 'freeAmbush', passive: false,
    description: 'Засідка без карти MAFIA в одному районі. При невдачі гине.' },
  { id: 'lenny_pike', name: 'Ленні «Щука»', ability: 'spyCards', passive: false,
    description: 'Шпигун: 1 раз за коло подивитися всі карти MAFIA у будь-якого гравця.' },
  { id: 'leo_acrobat', name: 'Лео «Акробат»', ability: 'earlyRelease', passive: true,
    description: 'При попаданні у в\'язницю одразу виходить (0 ходів).' },
  { id: 'willie_ruthless', name: 'Віллі «Безжалісний»', ability: 'robOnKill', passive: true, bonusAmount: 1000,
    description: 'За успішного замаху грабує жертву на 1000$.' },
  { id: 'tony_fox', name: 'Тоні «Лис»', ability: 'influenceOnKill', passive: true,
    description: 'При успішному замаху +1 вплив у будь-якому районі.' },
  { id: 'capo_corrado', name: 'Капо Коррадо', ability: 'extraStep', passive: false,
    description: 'Після ходу можна зміститися на 1 крок уперед.' },
  { id: 'mickey_renegade', name: 'Міккі «Відступник»', ability: 'policeTax', passive: true,
    description: 'Збирач податків: коли інші гравці платять хабар поліції, 50% йде тобі.' },
  { id: 'baby_flemmi', name: 'Малюк Флеммі', ability: 'counterAttack', passive: true,
    description: 'При замаху удар у відповідь. Кубик: 1-2 влучає, 3-6 промах.' },
  { id: 'tommy_morello', name: 'Томмі Морелло', ability: 'diplomat', passive: false,
    description: 'Дипломат: 1 раз за гру скасувати будь-яку карту, яку зіграли проти тебе.' },
  { id: 'survivor_joe', name: 'Живучий Джо', ability: 'surviveOnce', passive: true, rechargeable: true,
    description: 'Блокує замах та перезаряджується 1 коло. Якщо атакують під час перезарядки — Джо гине.' },
  { id: 'steel_ronnie', name: '«Сталевий» Ронні', ability: 'doubleBuyOff', passive: true,
    description: 'Відкуп від ваших замахів коштує вдвічі дорожче.' },
  { id: 'donnie_angelo', name: 'Донні Анджело', ability: 'freeInfluenceOnStart', passive: true,
    description: 'Інвестор: при проходженні START +1 безкоштовний вплив на будь-який твій бізнес.' },
  { id: 'marco_player', name: 'Марко «Гравець»', ability: 'casinoTriple', passive: true,
    description: 'Шулер: твої виграші у казино множаться на 3× (замість 2×).' }
];

// --- PLAYER CHARACTERS (up to 8) ---
const CHARACTERS = [
  { id: 'eddie', name: 'Едді «Божевільний»', color: '#e74c3c', icon: 'E', title: 'Вуличний боєць' },
  { id: 'carlo', name: 'Карло «Бритва»', color: '#2980b9', icon: 'C', title: 'Старий лис' },
  { id: 'vinnie', name: 'Вінні «Кулак»', color: '#2ecc71', icon: 'V', title: 'Зелений барон' },
  { id: 'sal', name: 'Сальваторе «Золото»', color: '#f1c40f', icon: 'S', title: 'Золотий король' },
  { id: 'niko', name: 'Ніко «Тінь»', color: '#9b59b6', icon: 'N', title: 'Тіньовий владика' },
  { id: 'rosa', name: 'Донна Роза', color: '#e91e90', icon: 'R', title: 'Залізна леді' },
  { id: 'tommy', name: 'Томмі «Динаміт»', color: '#e67e22', icon: 'T', title: 'Вогняний темперамент' },
  { id: 'frankie', name: 'Френкі «Лід»', color: '#00bcd4', icon: 'F', title: 'Холодний розрахунок' }
];

// --- CASINO ROULETTE ---
// Simplified: Red/Black only, green stripe = jackpot on any bet
// Wheel has 12 sectors: 5 red, 5 black, 2 green (jackpot)
const CASINO = {
  sectors: [
    'red','black','red','black','red','green',
    'black','red','black','red','black','green'
  ],
  betTypes: [
    { id: 'red', name: 'Червоне', payout: 2 },
    { id: 'black', name: 'Чорне', payout: 2 }
  ],
  minBet: 500,
  maxBet: 5000
};

// --- CONSTANTS ---
const STARTING_MONEY = 20000;
const HELPER_HIRE_COST = 1000;
const TOTAL_SECTORS = BOARD.length; // 36
const CORNER_SECTORS = [0, 11, 18, 29]; // START, BAR, POLICE, PRISON
const BUYOFF_EXTRA = 1000;

module.exports = {
  RESPECT_LEVELS, DISTRICTS, BOARD, BOARD_GRID, DISTRICT_SECTORS,
  MAFIA_CARDS, EVENT_CARDS, HELPERS, CHARACTERS, CASINO,
  STARTING_MONEY, HELPER_HIRE_COST, TOTAL_SECTORS, CORNER_SECTORS,
  BUYOFF_EXTRA, buildMafiaDeck
};
