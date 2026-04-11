// ============================================================
// MAFIA BUSINESS v2 — Game Engine
// ============================================================
const {
  RESPECT_LEVELS, DISTRICTS, BOARD, BOARD_GRID, DISTRICT_SECTORS,
  MAFIA_CARDS, EVENT_CARDS, HELPERS, CHARACTERS, CASINO,
  STARTING_MONEY, HELPER_HIRE_COST, TOTAL_SECTORS, CORNER_SECTORS,
  BUYOFF_EXTRA, buildMafiaDeck
} = require('./data');

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rollDice(count = 2) {
  const dice = [];
  for (let i = 0; i < count; i++) dice.push(Math.floor(Math.random() * 6) + 1);
  return dice;
}

class GameEngine {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = [];
    this.currentPlayerIndex = 0;
    this.phase = 'waiting'; // waiting, playing, finished
    this.turnPhase = 'roll'; // roll, resolve, action, end
    this.mafiaDeck = [];
    this.mafiaDiscard = [];
    this.eventDeck = [];
    this.eventDiscard = [];
    this.helperDeck = [];
    this.bombs = []; // { sector, placedBy }
    this.businesses = {}; // businessId -> { owner, influenceTokens: { playerId: count } }
    this.log = [];
    this.pendingAction = null; // for reactions, choices, casino
    this._deferredLanding = null; // deferred landing after bomb explosion
    this.turnNumber = 0;
    this.mafiaCardMinRound = 3; // min round before mafia cards can be used (configurable)
    this.maxRounds = 30;
    this.hostId = null; // first human player to join
  }

  // --- SETUP ---
  addPlayer(id, name, isBot = false, characterId = null) {
    if (this.players.length >= 8) return null;
    if (this.phase !== 'waiting') return null;
    // Pick character: prefer requested, fallback to first available
    const usedCharIds = this.players.map(p => p.character?.id).filter(Boolean);
    let character;
    if (characterId) {
      character = CHARACTERS.find(c => c.id === characterId && !usedCharIds.includes(c.id));
    }
    if (!character) {
      character = CHARACTERS.find(c => !usedCharIds.includes(c.id)) || CHARACTERS[this.players.length];
    }
    const player = {
      id,
      name,
      character,
      money: STARTING_MONEY,
      position: 0, // START
      respectLevel: 1,
      helpers: [], // up to 2 helper objects
      mafiaCards: [],
      businesses: [], // business ids owned
      inPrison: 0, // turns remaining
      alive: true,
      isBot: isBot,
      canUpgradeRespect: false, // resets after passing START
      helperStates: {}, // for rechargeable abilities like Survivor Joe
      passedStartThisTurn: false,
      stats: {
        moneyEarned: 0, moneySpent: 0, businessesBought: 0,
        helpersHired: 0, attacksMade: 0, attacksSurvived: 0,
        roundsSurvived: 0, mafiaCardsUsed: 0,
        casinoWins: 0, casinoLosses: 0, timesInPrison: 0,
        totalRentCollected: 0, totalRentPaid: 0
      },
      avatar: null // player chosen avatar
    };
    this.players.push(player);
    if (!isBot && !this.hostId) this.hostId = id;
    return player;
  }

  removePlayer(playerId) {
    this.players = this.players.filter(p => p.id !== playerId);
  }

  startGame() {
    if (this.players.length < 2) return false;
    this.phase = 'rolling_order'; // Phase where players roll dice for turn order
    this.orderRolls = {}; // playerId -> { dice1, dice2, total }
    this.orderRollCurrent = 0; // index of player currently rolling

    // Init decks
    this.mafiaDeck = shuffle(buildMafiaDeck());
    this.eventDeck = shuffle([...EVENT_CARDS]);
    this.helperDeck = shuffle([...HELPERS]);

    // Init businesses
    for (const district of DISTRICTS) {
      for (const biz of district.businesses) {
        this.businesses[biz.id] = { owner: null, districtId: district.id, influenceLevel: 0 };
      }
    }

    // Init influence
    for (const p of this.players) {
      p.helperStates = { survivorJoeActive: true };
    }

    this.addLog('Кидайте кубики щоб визначити порядок ходів!');
    return true;
  }

  rollForOrder(playerId) {
    const player = this.getPlayer(playerId);
    if (!player) return { error: 'Гравця не знайдено' };
    if (this.phase !== 'rolling_order') return { error: 'Не та фаза гри' };
    if (this.orderRolls[playerId]) return { error: 'Ви вже кинули кубики' };

    // Check it's this player's turn to roll
    const expectedPlayer = this.players[this.orderRollCurrent];
    if (expectedPlayer.id !== playerId) return { error: 'Зараз не ваша черга кидати' };

    const dice1 = Math.floor(Math.random() * 6) + 1;
    const dice2 = Math.floor(Math.random() * 6) + 1;
    const total = dice1 + dice2;
    this.orderRolls[playerId] = { dice1, dice2, total };
    this.addLog(`${player.name} кинув ${dice1} + ${dice2} = ${total}`);

    // Move to next player
    this.orderRollCurrent++;

    // Check if all players have rolled
    if (this.orderRollCurrent >= this.players.length) {
      return this.finalizeOrder(playerId, dice1, dice2, total);
    }

    return { dice1, dice2, total, allRolled: false };
  }

  finalizeOrder(lastPlayerId, lastDice1, lastDice2, lastTotal) {
    // Sort players by roll result (highest first)
    const sorted = [...this.players].sort((a, b) => {
      return (this.orderRolls[b.id]?.total || 0) - (this.orderRolls[a.id]?.total || 0);
    });

    // Reorder players array
    this.players = sorted;

    // Log the order
    const orderStr = sorted.map((p, i) => `${i + 1}. ${p.name} (${this.orderRolls[p.id]?.total})`).join(', ');
    this.addLog(`Порядок ходів: ${orderStr}`);

    // Start the actual game
    this.phase = 'playing';
    this.turnPhase = 'roll';
    this.currentPlayerIndex = 0;
    this.turnNumber = 0;
    this.addLog(`Гра розпочалась! Першим ходить ${sorted[0].name}!`);

    return { dice1: lastDice1, dice2: lastDice2, total: lastTotal, allRolled: true, order: sorted.map(p => ({ id: p.id, name: p.name, roll: this.orderRolls[p.id]?.total })) };
  }

  // --- HELPERS ---
  getCurrentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  getPlayer(playerId) {
    return this.players.find(p => p.id === playerId);
  }

  getAlivePlayers() {
    return this.players.filter(p => p.alive);
  }

  getCurrentRound() {
    const playerCount = this.players.length;
    if (playerCount === 0) return 0;
    return Math.floor(this.turnNumber / playerCount) + 1;
  }

  getRespectData(level) {
    return RESPECT_LEVELS.find(r => r.level === level);
  }

  getSector(index) {
    return BOARD[index % TOTAL_SECTORS];
  }

  getDistrict(districtId) {
    return DISTRICTS.find(d => d.id === districtId);
  }

  getBusiness(businessId) {
    for (const d of DISTRICTS) {
      for (const b of d.businesses) {
        if (b.id === businessId) return { ...b, districtId: d.id };
      }
    }
    return null;
  }

  getDistrictOfSector(sectorIndex) {
    for (const [districtId, sectors] of Object.entries(DISTRICT_SECTORS)) {
      if (sectors.includes(sectorIndex)) return districtId;
    }
    return null;
  }

  getDistrictByPosition(position) {
    const districtId = this.getDistrictOfSector(position);
    if (!districtId) return null;
    return DISTRICTS.find(d => d.id === districtId) || null;
  }

  getPlayerBusinessesInDistrict(playerId, districtId) {
    const player = this.getPlayer(playerId);
    return player.businesses.filter(bizId => {
      return this.businesses[bizId] && this.businesses[bizId].districtId === districtId;
    });
  }

  getPlayerInfluenceInDistrict(playerId, districtId) {
    let total = 0;
    const player = this.getPlayer(playerId);
    for (const bizId of player.businesses) {
      const bizState = this.businesses[bizId];
      if (bizState && bizState.districtId === districtId) {
        total += (bizState.influenceLevel || 0);
      }
    }
    return total;
  }

  _offerBarHire(player) {
    const respect = this.getRespectData(player.respectLevel);
    const canHire = respect.maxHelpers > player.helpers.length;
    if (canHire && player.money >= HELPER_HIRE_COST) {
      this.pendingAction = {
        type: 'bar_choice',
        playerId: player.id,
        passedThrough: true,
        choices: [
          { id: 'hire', label: `Найняти помічника (1000$)` },
          { id: 'skip', label: 'Пропустити' }
        ],
        canHire,
        maxHelpers: respect.maxHelpers,
        currentHelpers: player.helpers.length
      };
    }
  }

  getDistrictOwnerCounts(districtId) {
    const counts = {};
    for (const p of this.players) {
      const bizzes = this.getPlayerBusinessesInDistrict(p.id, districtId);
      if (bizzes.length > 0) counts[p.id] = bizzes.length;
    }
    return counts;
  }

  hasHelper(playerId, abilityId) {
    const player = this.getPlayer(playerId);
    return player.helpers.some(h => h.ability === abilityId);
  }

  getAttackCost(player, baseCost) {
    let cost = baseCost;
    const respect = this.getRespectData(player.respectLevel);
    cost -= respect.attackDiscount;
    if (this.hasHelper(player.id, 'cheaperAttacks')) cost -= 500;
    return Math.max(0, cost);
  }

  addLog(message) {
    this.log.push({ time: Date.now(), message, turn: this.turnNumber });
    if (this.log.length > 200) this.log.shift();
  }

  drawMafiaCard() {
    if (this.mafiaDeck.length === 0) {
      this.mafiaDeck = shuffle(this.mafiaDiscard);
      this.mafiaDiscard = [];
    }
    return this.mafiaDeck.pop() || null;
  }

  drawEventCard() {
    if (this.eventDeck.length === 0) {
      this.eventDeck = shuffle(this.eventDiscard);
      this.eventDiscard = [];
    }
    return this.eventDeck.pop() || null;
  }

  drawHelperCard() {
    if (this.helperDeck.length === 0) return null;
    return this.helperDeck.pop();
  }

  returnHelperToDeck(helper) {
    this.helperDeck.unshift(helper); // to bottom
  }

  // --- CORE TURN LOGIC ---
  rollDiceForPlayer(playerId) {
    const player = this.getPlayer(playerId);
    if (!player || player.id !== this.getCurrentPlayer().id) return null;
    if (this.turnPhase !== 'roll') return null;
    // BAR action pending from wedding event — resolve BAR before rolling
    if (player._barActionPending) {
      delete player._barActionPending;
      this.resolveBar(player);
      this.turnPhase = 'action';
      return { barAction: true, skipDice: true };
    }
    if (player.inPrison > 0) {
      return this.handlePrisonTurn(player);
    }
    const dice = rollDice(2);
    const total = dice[0] + dice[1];
    this.addLog(`${player.name} кинув кубики: ${dice[0]} + ${dice[1]} = ${total}`);
    const result = this.movePlayer(player, total);
    return { dice, total, ...result };
  }

  handlePrisonTurn(player) {
    player.inPrison--;
    // Leo Acrobat: reduce by 1
    if (this.hasHelper(player.id, 'earlyRelease') && player.inPrison > 0) {
      player.inPrison = 0;
      this.addLog(`Лео «Акробат» допоміг ${player.name} вийти одразу!`);
    }
    if (player.inPrison <= 0) {
      player.inPrison = 0;
      this.addLog(`${player.name} вийшов з в'язниці!`);
      // Player is released but still skips this turn — they play next turn
      return { inPrison: false, released: true };
    }
    this.addLog(`${player.name} у в'язниці (ще ${player.inPrison} ходів).`);
    this.turnPhase = 'end';
    return { inPrison: true, turnsLeft: player.inPrison };
  }

  movePlayer(player, steps) {
    const oldPos = player.position;
    let newPos = oldPos;
    const events = [];

    // Move step by step to check pass-through sectors
    for (let i = 0; i < steps; i++) {
      newPos = (newPos + 1) % TOTAL_SECTORS;
      const sector = this.getSector(newPos);

      // Check for bombs on pass-through (not final position)
      if (i < steps - 1) {
        const bombIndex = this.bombs.findIndex(b => b.sector === newPos);
        if (bombIndex >= 0) {
          events.push({ type: 'bomb_triggered', sector: newPos });
          this.bombs.splice(bombIndex, 1);
          // Check for Lucky Shirt
          const hasLuckyShirt = player.mafiaCards.some(c => c.id === 'lucky_shirt');
          if (hasLuckyShirt) {
            player.mafiaCards = player.mafiaCards.filter(c => c.id !== 'lucky_shirt');
            this.addLog(`${player.name} вижив завдяки карті "Народжений у сорочці"!`);
            events.push({ type: 'lucky_shirt_used' });
          } else {
            events.push({ type: 'bomb_damage', target: player.id });
            this.handleBombDamage(player);
          }
        }
      }

      // Pass-through effects
      if (i < steps - 1) {
        if (sector.type === 'START') {
          events.push(...this.handlePassStart(player));
        }
        if (sector.type === 'BAR') {
          // Marco "Player" bonus on passing BAR
          if (this.hasHelper(player.id, 'barBonus')) {
            player.money += 1000;
            this.addLog(`Марко «Гравець» отримав 1000$ у BAR!`);
            events.push({ type: 'barBonus', amount: 500 });
          }
          // Passing through BAR: offer to hire helper (per rules)
          events.push({ type: 'bar_passed' });
          this._barPassedThisTurn = true;
        }
        if (sector.type === 'POLICE') {
          events.push(...this.handlePolice(player));
        }
      }
    }

    player.position = newPos;
    player.passedStartThisTurn = events.some(e => e.type === 'start_passed');

    // Check bomb on landing
    let bombExplodedOnLanding = false;
    const bombIndex = this.bombs.findIndex(b => b.sector === newPos);
    if (bombIndex >= 0) {
      events.push({ type: 'bomb_triggered', sector: newPos });
      this.bombs.splice(bombIndex, 1);
      const hasLuckyShirt = player.mafiaCards.some(c => c.id === 'lucky_shirt');
      if (hasLuckyShirt) {
        player.mafiaCards = player.mafiaCards.filter(c => c.id !== 'lucky_shirt');
        this.addLog(`${player.name} вижив завдяки карті "Народжений у сорочці"!`);
        events.push({ type: 'lucky_shirt_used' });
      } else {
        events.push({ type: 'bomb_damage', target: player.id });
        this.handleBombDamage(player);
        bombExplodedOnLanding = true;
      }
    }

    const landingSector = this.getSector(newPos);

    // If bomb exploded on landing and player is dead, no need to resolve landing
    if (bombExplodedOnLanding && !player.alive) {
      this._barPassedThisTurn = false;
      this.turnPhase = 'action';
      return {
        oldPos,
        newPos,
        events,
        landingSector,
        landingResult: null,
        bombExploded: true
      };
    }

    // If bomb exploded on landing and player has helpers (pending bomb_choose_helper),
    // defer the landing resolution until after bomb damage is resolved
    if (bombExplodedOnLanding && this.pendingAction && this.pendingAction.type === 'bomb_choose_helper') {
      this._deferredLanding = {
        playerId: player.id,
        sector: landingSector,
        barPassedThisTurn: this._barPassedThisTurn,
        hasCorrado: this.hasHelper(player.id, 'extraStep') && !player._usedExtraStepThisTurn
      };
      this._barPassedThisTurn = false;
      this.turnPhase = 'action';
      return {
        oldPos,
        newPos,
        events,
        landingSector,
        landingResult: null,
        bombExploded: true,
        bombPendingChoice: true
      };
    }

    // Cappo Corrado: option to move 1 extra step BEFORE resolving landing
    const hasCorrado = this.hasHelper(player.id, 'extraStep') && !player._usedExtraStepThisTurn;

    if (hasCorrado) {
      // Don't resolve landing yet — ask player whether to step forward
      this.pendingAction = {
        type: 'extra_step_choice',
        playerId: player.id,
        currentPos: player.position,
        nextPos: (player.position + 1) % TOTAL_SECTORS,
        currentSectorName: landingSector.name || landingSector.type,
        nextSectorName: (this.getSector((player.position + 1) % TOTAL_SECTORS).name || this.getSector((player.position + 1) % TOTAL_SECTORS).type)
      };

      // Save bar flag for after landing resolves
      if (this._barPassedThisTurn && landingSector.type !== 'BAR') {
        this._barHirePending = player.id;
      }
      this._barPassedThisTurn = false;

      this.turnPhase = 'action';

      return {
        oldPos,
        newPos,
        events,
        landingSector,
        landingResult: null,
        canExtraStep: true,
        extraStepPending: true
      };
    }

    // No Corrado — resolve landing immediately
    const landingResult = this.resolveLanding(player, landingSector);

    // If passed through BAR but didn't land on it, offer helper hire
    // If there's already a pending action (buy/rent), save the bar flag for later
    if (this._barPassedThisTurn && landingSector.type !== 'BAR') {
      if (!this.pendingAction) {
        this._offerBarHire(player);
      } else {
        // Will be offered after current pending action resolves
        this._barHirePending = player.id;
      }
    }
    this._barPassedThisTurn = false;

    this.turnPhase = 'action'; // player can now use mafia cards, upgrade, etc.

    return {
      oldPos,
      newPos,
      events,
      landingSector,
      landingResult,
      canExtraStep: false
    };
  }

  resolveExtraStepChoice(playerId, useStep) {
    const player = this.getPlayer(playerId);
    if (!player) return { error: 'Гравець не знайдений.' };
    if (!this.pendingAction || this.pendingAction.type !== 'extra_step_choice') {
      return { error: 'Немає очікуваного вибору Коррадо.' };
    }
    if (this.pendingAction.playerId !== playerId) {
      return { error: 'Не ваш вибір.' };
    }

    this.pendingAction = null;

    let bombExplodedOnStep = false;
    if (useStep) {
      // Move player forward 1 step
      const oldPos = player.position;
      player.position = (player.position + 1) % TOTAL_SECTORS;
      player._usedExtraStepThisTurn = true;
      this.addLog(`Капо Коррадо: ${player.name} зміщується на 1 крок.`);

      // Check for bombs on new position
      const bombIndex = this.bombs.findIndex(b => b.sector === player.position);
      if (bombIndex >= 0) {
        this.bombs.splice(bombIndex, 1);
        this.addLog(`${player.name} наступив на бомбу!`);
        this.handleBombDamage(player);
        bombExplodedOnStep = true;
      }
    }

    // If bomb killed the player, no landing resolution needed
    if (bombExplodedOnStep && !player.alive) {
      if (this._barHirePending === player.id) this._barHirePending = null;
      return { success: true, useStep, newPos: player.position, landingSector: this.getSector(player.position), landingResult: null, bombExploded: true };
    }

    // If bomb exploded and player needs to choose helper, defer landing
    if (bombExplodedOnStep && this.pendingAction && this.pendingAction.type === 'bomb_choose_helper') {
      const landingSector = this.getSector(player.position);
      this._deferredLanding = {
        playerId: player.id,
        sector: landingSector,
        barPassedThisTurn: false,
        hasCorrado: false
      };
      // Save bar hire pending for after deferred landing
      if (this._barHirePending === player.id) {
        this._deferredLanding.barHirePending = true;
      }
      return { success: true, useStep, newPos: player.position, landingSector, landingResult: null, bombExploded: true, bombPendingChoice: true };
    }

    // Now resolve landing on the (possibly new) position
    const landingSector = this.getSector(player.position);
    const landingResult = this.resolveLanding(player, landingSector);

    // Handle bar pass-through hire that was deferred
    if (this._barHirePending === player.id) {
      if (!this.pendingAction) {
        this._offerBarHire(player);
      }
      // If there's a pending action from resolveLanding, barHirePending stays for later
      if (!this.pendingAction || this.pendingAction.type === 'bar_choice') {
        this._barHirePending = null;
      }
    }

    return { success: true, useStep, newPos: player.position, landingSector, landingResult };
  }

  handlePassStart(player) {
    const respect = this.getRespectData(player.respectLevel);
    player.money += respect.startBonus;
    player.stats.moneyEarned += respect.startBonus;
    player.canUpgradeRespect = true;
    this.addLog(`${player.name} пройшов START: +${respect.startBonus}$.`);
    return [{ type: 'start_passed', bonus: respect.startBonus }];
  }

  handlePolice(player) {
    if (this.hasHelper(player.id, 'noBribe')) {
      player.money += 500;
      this.addLog(`Міккі «Відступник» допоміг ${player.name} уникнути хабара і заробив 500$!`);
      return [{ type: 'police_bribe_skipped' }];
    }
    // Corruption card: skip bribe
    if (player._corruptionTurns && player._corruptionTurns > 0) {
      player._corruptionTurns--;
      this.addLog(`${player.name} уникнув хабара завдяки корупції! (залишилось ${player._corruptionTurns} ходів)`);
      return [{ type: 'police_bribe_skipped' }];
    }
    const respect = this.getRespectData(player.respectLevel);
    player.money -= respect.policeBribe;
    player.stats.moneySpent += respect.policeBribe;
    this.addLog(`${player.name} заплатив хабар поліції: ${respect.policeBribe}$.`);
    return [{ type: 'police_bribe', amount: respect.policeBribe }];
  }

  handleBombDamage(player) {
    if (player.helpers.length > 0) {
      // Player chooses which helper dies from bomb (pendingAction)
      this.pendingAction = {
        type: 'bomb_choose_helper',
        playerId: player.id,
        message: 'Бомба! Оберіть, який помічник загине.'
      };
    } else {
      this.killBoss(player, 'bomb');
    }
  }

  /**
   * Called after bomb_choose_helper is resolved, to continue with the
   * landing resolution that was deferred because of the bomb explosion.
   */
  resolveDeferredLanding(playerId) {
    const deferred = this._deferredLanding;
    if (!deferred || deferred.playerId !== playerId) return null;
    this._deferredLanding = null;

    const player = this.getPlayer(playerId);
    if (!player || !player.alive) return null;

    const landingSector = deferred.sector;

    // Check if Corrado extra step should be offered
    if (deferred.hasCorrado) {
      this.pendingAction = {
        type: 'extra_step_choice',
        playerId: player.id,
        currentPos: player.position,
        nextPos: (player.position + 1) % TOTAL_SECTORS,
        currentSectorName: landingSector.name || landingSector.type,
        nextSectorName: (this.getSector((player.position + 1) % TOTAL_SECTORS).name || this.getSector((player.position + 1) % TOTAL_SECTORS).type)
      };

      if (deferred.barPassedThisTurn && landingSector.type !== 'BAR') {
        this._barHirePending = player.id;
      }

      return {
        landingSector,
        landingResult: null,
        canExtraStep: true,
        extraStepPending: true
      };
    }

    // Resolve landing normally
    const landingResult = this.resolveLanding(player, landingSector);

    // Handle bar pass-through hire
    const needBarHire = deferred.barPassedThisTurn || deferred.barHirePending;
    if (needBarHire && landingSector.type !== 'BAR') {
      if (!this.pendingAction) {
        this._offerBarHire(player);
      } else {
        this._barHirePending = player.id;
      }
    }

    return { landingSector, landingResult };
  }

  resolveLanding(player, sector) {
    switch (sector.type) {
      case 'START':
        return this.resolveLandOnStart(player);
      case 'business':
        return this.resolveBusiness(player, sector);
      case 'MAFIA':
        return this.resolveMafia(player);
      case 'EVENT':
        return this.resolveEvent(player);
      case 'POLICE':
        return this.resolveLandOnPolice(player);
      case 'PRISON':
        return { type: 'prison_pass', message: 'Просто відвідування.' };
      case 'BAR':
        return this.resolveBar(player);
      default:
        return { type: 'unknown' };
    }
  }

  resolveLandOnStart(player) {
    // Landing exactly on START: normal pass-through + bonus choice
    const passEvents = this.handlePassStart(player);
    this.pendingAction = {
      type: 'start_bonus_choice',
      playerId: player.id,
      choices: [
        { id: 'extra_mafia', label: 'Взяти ще 1 карту MAFIA' },
        { id: 'extra_cash', label: 'Отримати +500$' },
        { id: 'free_influence', label: 'Безкоштовно +1 вплив (де є бізнес)' }
      ]
    };
    return { type: 'start_landing', passEvents, pendingChoice: true };
  }

  resolveStartBonusChoice(playerId, choiceId) {
    const player = this.getPlayer(playerId);
    if (!player) return null;
    switch (choiceId) {
      case 'extra_mafia': {
        const card = this.drawMafiaCard();
        if (card) player.mafiaCards.push(card);
        this.addLog(`${player.name} взяв додаткову карту MAFIA.`);
        break;
      }
      case 'extra_cash':
        player.money += 500;
        this.addLog(`${player.name} отримав бонусні 500$.`);
        break;
      case 'free_influence': {
        const ownedBizzes = player.businesses.filter(bizId =>
          this.businesses[bizId] && this.businesses[bizId].influenceLevel < 4
        );
        if (ownedBizzes.length > 0) {
          this.pendingAction = {
            type: 'choose_influence_business',
            playerId: player.id,
            free: true,
            businesses: ownedBizzes.map(bizId => ({
              id: bizId,
              name: this.getBusiness(bizId).name,
              currentLevel: this.businesses[bizId].influenceLevel
            }))
          };
          return { type: 'choose_business' };
        }
        this.pendingAction = null;
        return { type: 'no_upgradeable_business' };
      }
    }
    this.pendingAction = null;
    return { type: 'bonus_applied', choiceId };
  }

  resolveBusiness(player, sector) {
    const district = this.getDistrict(sector.districtId);
    const biz = district.businesses[sector.businessIndex];
    const bizState = this.businesses[biz.id];

    // Lenny Pike bonus: 200$ on non-mafia sectors
    if (this.hasHelper(player.id, 'bonusOnNonMafia')) {
      player.money += 500;
      this.addLog(`Ленні «Щука» отримав бонус 500$.`);
    }

    if (!bizState.owner) {
      // Free business — player can buy or auction
      this.pendingAction = {
        type: 'buy_business',
        playerId: player.id,
        businessId: biz.id,
        districtId: sector.districtId,
        price: biz.price,
        name: biz.name,
        rent: biz.rent,
        districtName: district.name,
        districtColor: district.color,
        influenceCost: district.influenceCost
      };
      return { type: 'free_business', biz, pendingChoice: true };
    }

    if (bizState.owner === player.id) {
      // Landing on own business: can upgrade influence on THIS business
      const currentLevel = bizState.influenceLevel || 1;
      if (currentLevel < 4) {
        let cost = district.influenceCost;
        if (this.hasHelper(player.id, 'cheaperInfluence')) cost -= 200;
        cost = Math.max(0, cost);
        if (player.money >= cost) {
          this.pendingAction = {
            type: 'upgrade_influence_on_own',
            playerId: player.id,
            districtId: sector.districtId,
            businessId: biz.id,
            businessName: biz.name,
            districtName: district.name,
            currentLevel,
            cost
          };
          return { type: 'own_business', biz, canUpgradeInfluence: true, cost, currentLevel };
        }
      }
      // Also check if player can buyout neighboring business in same district
      return { type: 'own_business', biz };
    }

    // Someone else owns it
    const owner = this.getPlayer(bizState.owner);

    // Owner is in prison — business can be seized (bought) by the landing player
    if (owner.inPrison > 0) {
      this.pendingAction = {
        type: 'seize_prison_business',
        playerId: player.id,
        ownerId: owner.id,
        businessId: biz.id,
        districtId: sector.districtId,
        price: biz.price,
        name: biz.name,
        ownerName: owner.name
      };
      return { type: 'prison_business', biz, ownerName: owner.name, pendingChoice: true };
    }

    // Owner is free — pay rent
    const ownerBizCount = this.getPlayerBusinessesInDistrict(owner.id, sector.districtId).length;
    const rentIndex = Math.min(ownerBizCount - 1, 2);
    const baseRent = biz.rent[rentIndex];
    // Influence bonus: each upgrade above base (level 1) adds influenceCost
    const influenceBonus = Math.max(0, (bizState.influenceLevel - 1)) * district.influenceCost;
    let rentAmount = baseRent + influenceBonus;
    // Money laundering: double rent collected
    if (owner._doubleIncome && owner._doubleIncome > 0) {
      rentAmount *= 2;
    }

    // Check if player has Robbery card (will be handled via pendingAction)
    const hasRobbery = player.mafiaCards.some(c => c.id === 'robbery');

    // Check if player can buyout through influence dominance
    const playerTotalStars = this.getPlayerInfluenceInDistrict(player.id, sector.districtId);
    const ownerTotalStars = this.getPlayerInfluenceInDistrict(owner.id, sector.districtId);
    const canBuyout = playerTotalStars > ownerTotalStars && player.money >= biz.price + rentAmount;

    this.pendingAction = {
      type: 'pay_rent',
      playerId: player.id,
      playerName: player.name,
      playerCharacter: player.character,
      ownerId: owner.id,
      ownerName: owner.name,
      ownerCharacter: owner.character,
      businessId: biz.id,
      amount: rentAmount,
      businessName: biz.name,
      canRob: hasRobbery,
      canBuyout,
      buyoutPrice: biz.price
    };
    return { type: 'pay_rent', biz, rentAmount, ownerName: owner.name, pendingChoice: true };
  }

  executeSeizePrisonBusiness(playerId, businessId, buy) {
    const player = this.getPlayer(playerId);
    const biz = this.getBusiness(businessId);
    if (!biz) return { error: 'Бізнес не знайдено' };

    const action = this.pendingAction;
    if (!action || action.type !== 'seize_prison_business') return { error: 'Немає дії.' };

    const owner = this.getPlayer(action.ownerId);

    if (buy) {
      if (player.money < biz.price) {
        return { error: 'Недостатньо коштів' };
      }
      // Remove business from imprisoned owner
      owner.businesses = owner.businesses.filter(b => b !== businessId);
      // Reset influence
      this.businesses[businessId].influenceLevel = 0;
      // Transfer to new owner
      player.money -= biz.price;
      this.businesses[businessId].owner = playerId;
      player.businesses.push(businessId);
      this.businesses[businessId].influenceLevel = 1;
      this.addLog(`${player.name} захопив ${biz.name} у ${owner.name} (у в'язниці) за ${biz.price}$!`);
      this.pendingAction = null;
      return { success: true, seized: true };
    } else {
      // Skip — don't buy
      this.pendingAction = null;
      this.addLog(`${player.name} не захопив ${biz.name} у ${owner.name}.`);
      return { success: true, skipped: true };
    }
  }

  executeBuyBusiness(playerId, businessId, buy) {
    const player = this.getPlayer(playerId);
    const biz = this.getBusiness(businessId);
    if (!biz) return { error: 'Бізнес не знайдено' };

    if (buy) {
      if (player.money < biz.price) {
        return { error: 'Недостатньо коштів' };
      }
      player.money -= biz.price;
      player.stats.moneySpent += biz.price;
      player.stats.businessesBought++;
      this.businesses[businessId].owner = playerId;
      player.businesses.push(businessId);
      // Set base influence level on the business
      this.businesses[businessId].influenceLevel = 1;
      this.addLog(`${player.name} купив ${biz.name} за ${biz.price}$.`);
      this.pendingAction = null;
      return { success: true, bought: true };
    } else {
      // Real-time auction: starts at minPrice, players raise by +500$, 5s timer per bid
      this.pendingAction = {
        type: 'auction',
        businessId,
        businessName: biz.name,
        districtId: biz.districtId,
        minPrice: biz.price,
        currentBid: 0,
        currentBidderId: null,
        currentBidderName: null,
        bidStep: 500,
        passed: [], // players who passed
        phase: 'bidding'
      };
      this.addLog(`${biz.name} виставлено на аукціон! Стартова ціна: ${biz.price}$`);
      return { success: true, auction: true };
    }
  }

  executePayRent(playerId, useRobbery = false) {
    const action = this.pendingAction;
    if (!action || action.type !== 'pay_rent') return { error: 'Немає дії' };

    const player = this.getPlayer(playerId);
    const owner = this.getPlayer(action.ownerId);

    if (useRobbery) {
      // Robbery card: owner pays player instead
      const cardIndex = player.mafiaCards.findIndex(c => c.id === 'robbery');
      if (cardIndex < 0) return { error: 'Немає карти Пограбування' };
      player.mafiaCards.splice(cardIndex, 1);
      const takeAmount = Math.min(action.amount, owner.money);
      owner.money -= takeAmount;
      player.money += takeAmount;
      this.addLog(`${player.name} пограбував ${owner.name} на ${takeAmount}$!`);
      this.pendingAction = null;
      return { success: true, robbery: true, amount: takeAmount };
    }

    // Normal rent payment
    if (player.money >= action.amount) {
      player.money -= action.amount;
      player.stats.moneySpent += action.amount;
      player.stats.totalRentPaid += action.amount;
      player._lastRentPaid = action.amount;

      // Check if someone has forgery (intercepts rent)
      const interceptor = this.getAlivePlayers().find(p => p._interceptRent && p.id !== player.id && p.id !== owner.id);
      if (interceptor) {
        interceptor._interceptRent = false;
        interceptor.money += action.amount;
        interceptor.stats.moneyEarned += action.amount;
        this.addLog(`${interceptor.name} перехопив ренту ${action.amount}$ завдяки підробці документів!`);
      } else {
        owner.money += action.amount;
        owner.stats.moneyEarned += action.amount;
        owner.stats.totalRentCollected += action.amount;
      }
      this.addLog(`${player.name} заплатив ${action.amount}$ за ${action.businessName}.`);
      this.pendingAction = null;
      return { success: true, paid: true };
    } else {
      // Can't pay - prison + lose respect, but owner gets the half money
      return this.handleCantPay(player, owner);
    }
  }

  handleCantPay(player, creditor = null) {
    const halfMoney = Math.floor(player.money / 2);
    player.money -= halfMoney;
    if (creditor && halfMoney > 0) {
      creditor.money += halfMoney;
      this.addLog(`${player.name} не може заплатити! Віддає ${halfMoney}$ ${creditor.name} та їде у в'язницю.`);
    } else {
      this.addLog(`${player.name} не може заплатити! Втрачає ${halfMoney}$ та їде у в'язницю.`);
    }
    this.loseRespect(player);
    this.sendToPrison(player, 2);
    this.pendingAction = null;
    return { success: true, cantPay: true, prisonTurns: 2, paidPartial: halfMoney };
  }

  resolveMafia(player) {
    let cardCount = 1;
    let peekCard = null;
    if (this.hasHelper(player.id, 'doubleMafia')) {
      // Peek at next card in deck
      if (this.mafiaDiscardPile.length > 0 || this.mafiaDeck.length > 1) {
        const peekIdx = this.mafiaDeck.length > 1 ? 1 : 0;
        if (this.mafiaDeck[peekIdx]) peekCard = { ...this.mafiaDeck[peekIdx] };
      }
      this.addLog(`Ніккі «Король» підглядає наступну карту в колоді!`);
    }
    const drawnCards = [];
    for (let i = 0; i < cardCount; i++) {
      const card = this.drawMafiaCard();
      if (card) drawnCards.push(card);
    }
    // Defer: don't add to hand yet, wait for player confirmation
    this.pendingAction = {
      type: 'mafia_confirm',
      playerId: player.id,
      cards: drawnCards,
      peekCard: peekCard
    };
    return { type: 'mafia', cards: drawnCards, peekCard, pendingConfirm: true };
  }

  executeMafiaConfirm(playerId) {
    const action = this.pendingAction;
    if (!action || action.type !== 'mafia_confirm' || action.playerId !== playerId) {
      return { error: 'Немає дії для підтвердження.' };
    }
    const player = this.getPlayer(playerId);
    const cards = action.cards || [];
    const addedCards = [];
    for (const card of cards) {
      if (card.id === 'confession') {
        this.sendToPrison(player, 1);
        this.addLog(`${player.name} витягнув "Явка з повинною" і вирушив до в'язниці!`);
        this.mafiaDiscard.push(card);
      } else {
        player.mafiaCards.push(card);
        addedCards.push(card);
      }
    }
    this.addLog(`${player.name} отримав ${addedCards.length} карту(и) MAFIA.`);
    this.pendingAction = null;
    return { success: true, cards: addedCards };
  }

  resolveEvent(player) {
    const card = this.drawEventCard();
    if (!card) return { type: 'event', card: null };
    // Defer: don't execute yet, wait for player confirmation
    this.pendingAction = {
      type: 'event_confirm',
      playerId: player.id,
      card: card
    };
    return { type: 'event', card, pendingConfirm: true };
  }

  executeEventConfirm(playerId) {
    const action = this.pendingAction;
    if (!action || action.type !== 'event_confirm' || action.playerId !== playerId) {
      return { error: 'Немає дії для підтвердження.' };
    }
    const player = this.getPlayer(playerId);
    const card = action.card;
    this.pendingAction = null; // clear BEFORE executing, so executeEventCard can set new ones
    this.addLog(`${player.name} тягне подію: ${card.name}`);
    const result = this.executeEventCard(player, card);
    this.eventDiscard.push(card);
    return { success: true, result };
  }

  executeEventCard(player, card) {
    switch (card.action) {
      case 'goToBar':
        player.position = 11; // BAR
        { const landResult = this.resolveLanding(player, this.getSector(11));
        return { moved: true, to: 11, landingResult: landResult }; }
      case 'goToStart':
        this.handlePassStart(player);
        player.position = 0;
        { const landResult = this.resolveLanding(player, this.getSector(0));
        return { moved: true, to: 0, landingResult: landResult }; }
      case 'rollOneForward': {
        const dice = rollDice(1);
        const moveResult = this.movePlayer(player, dice[0]);
        return { moved: true, dice, ...moveResult };
      }
      case 'goToNearestCorner': {
        const pos = player.position;
        let nearest = CORNER_SECTORS[0];
        let minDist = TOTAL_SECTORS;
        for (const c of CORNER_SECTORS) {
          const dist = (c - pos + TOTAL_SECTORS) % TOTAL_SECTORS;
          if (dist > 0 && dist < minDist) { minDist = dist; nearest = c; }
        }
        player.position = nearest;
        const cornerLandResult = this.resolveLanding(player, this.getSector(nearest));
        return { moved: true, to: nearest, landingResult: cornerLandResult };
      }
      case 'rollOneBack': {
        const dice = rollDice(1);
        player.position = (player.position - dice[0] + TOTAL_SECTORS) % TOTAL_SECTORS;
        const backLandResult = this.resolveLanding(player, this.getSector(player.position));
        return { moved: true, dice, backward: true, to: player.position, landingResult: backLandResult };
      }
      case 'pay':
        if (player.money >= card.amount) {
          player.money -= card.amount;
          return { paid: card.amount };
        }
        return this.handleCantPay(player);
      case 'loseHelper':
        if (player.helpers.length > 0) {
          this.pendingAction = {
            type: 'choose_lose_helper',
            playerId: player.id,
            reason: card.name
          };
          return { chooseHelper: true };
        }
        return { noHelpers: true };
      case 'payAndLoseHelper':
        if (player.money >= card.amount) player.money -= card.amount;
        if (player.helpers.length > 0) {
          this.pendingAction = {
            type: 'choose_lose_helper',
            playerId: player.id,
            reason: card.name
          };
          return { paid: card.amount, chooseHelper: true };
        }
        return { paid: card.amount, noHelpers: true };
      case 'payOrPrison':
        this.pendingAction = {
          type: 'pay_or_prison',
          playerId: player.id,
          amount: card.amount
        };
        return { choice: true };
      case 'discardMafia':
        if (player.mafiaCards.length >= card.amount) {
          this.pendingAction = {
            type: 'discard_mafia_cards',
            playerId: player.id,
            count: card.amount
          };
          return { discardChoice: true };
        }
        // Discard all if less
        const discarded = player.mafiaCards.splice(0, player.mafiaCards.length);
        this.mafiaDiscard.push(...discarded);
        return { discarded: discarded.length };
      case 'payAndAllToBar':
        if (player.money >= card.amount) player.money -= card.amount;
        for (const p of this.getAlivePlayers()) {
          p.position = 11; // BAR
          if (p.id !== player.id) {
            p._barActionPending = true; // will get BAR choice on their turn
          }
        }
        this.addLog('Всі гравці переміщені у BAR на весілля!');
        return { paid: card.amount, allToBar: true };
      case 'receive':
        player.money += card.amount;
        return { received: card.amount };
      case 'receiveAndLoseHelper':
        player.money += card.amount;
        if (player.helpers.length > 0) {
          this.pendingAction = {
            type: 'choose_lose_helper',
            playerId: player.id,
            reason: card.name
          };
          return { received: card.amount, chooseHelper: true };
        }
        return { received: card.amount, noHelpers: true };
      case 'discardAttackReceive':
        const attackCardIdx = player.mafiaCards.findIndex(c => c.type === 'attack');
        if (attackCardIdx >= 0) {
          const removed = player.mafiaCards.splice(attackCardIdx, 1)[0];
          this.mafiaDiscard.push(removed);
          player.money += card.amount;
          return { discardedAttack: removed.name, received: card.amount };
        }
        return { noAttackCard: true };
      case 'drawMafia':
        const dmCards = [];
        for (let i = 0; i < card.amount; i++) {
          const c = this.drawMafiaCard();
          if (c) {
            if (c.id === 'confession') {
              this.sendToPrison(player, 1);
              this.addLog(`${player.name} витягнув "Явка з повинною" і вирушив до в'язниці!`);
              this.mafiaDiscard.push(c);
            } else {
              player.mafiaCards.push(c);
              dmCards.push(c);
            }
          }
        }
        return { drewMafia: dmCards.length };
      case 'birthdayGift':
        for (const p of this.getAlivePlayers()) {
          if (p.id !== player.id) {
            const gift = Math.min(card.amount, p.money);
            p.money -= gift;
            player.money += gift;
          }
        }
        return { birthday: true };
      case 'freeInfluence': {
        const upgradeable = this.getUpgradeableBusinesses(player.id);
        if (upgradeable.length > 0) {
          this.pendingAction = {
            type: 'choose_influence_business',
            playerId: player.id,
            free: true,
            businesses: upgradeable
          };
          return { chooseBusiness: true };
        }
        return { noUpgradeableBusiness: true };
      }
      default:
        return {};
    }
  }

  resolveLandOnPolice(player) {
    // Landing on police — choose action
    const others = this.getAlivePlayers().filter(p => p.id !== player.id && p.inPrison <= 0);
    this.pendingAction = {
      type: 'police_landing_choice',
      playerId: player.id,
      choices: [
        { id: 'pay_500', label: 'Заплатити 500$ (хабар)' },
        { id: 'defuse_bombs', label: 'Прибрати всі бомби з поля' },
        ...others.map(p => ({
          id: `snitch_${p.id}`,
          label: `Здати ${p.name} — у в'язницю на 1 хід`
        }))
      ]
    };
    return { type: 'police_landing', pendingChoice: true };
  }

  resolvePoliceChoice(playerId, choiceId) {
    const player = this.getPlayer(playerId);
    if (!player) return { error: 'Гравця не знайдено' };

    if (choiceId === 'pay_500') {
      player.money -= 500;
      this.addLog(`${player.name} заплатив поліції хабар 500$.`);
      this.pendingAction = null;
      return { success: true, type: 'bribe' };
    }

    if (choiceId === 'defuse_bombs') {
      const bombCount = this.bombs.length;
      this.bombs = [];
      this.addLog(`${player.name} попросив поліцію прибрати бомби! Знешкоджено: ${bombCount}.`);
      this.pendingAction = null;
      return { success: true, type: 'defuse', count: bombCount };
    }

    if (choiceId.startsWith('snitch_')) {
      const targetId = choiceId.replace('snitch_', '');
      const target = this.getPlayer(targetId);
      if (!target || !target.alive || target.inPrison > 0) {
        return { error: 'Неможливо здати цього гравця.' };
      }
      this.sendToPrison(target, 1);
      this.addLog(`${player.name} здав ${target.name} поліції! ${target.name} їде у в'язницю на 1 хід.`);
      this.pendingAction = null;
      return { success: true, type: 'snitch', targetName: target.name };
    }

    return { error: 'Невідомий вибір.' };
  }

  resolveBar(player) {
    // Bar landing: choose hire helpers OR casino
    if (this.hasHelper(player.id, 'barBonus')) {
      player.money += 1000;
      this.addLog(`Марко «Гравець» отримав 1000$ у BAR!`);
    }
    const respect = this.getRespectData(player.respectLevel);
    const canHire = respect.maxHelpers > player.helpers.length;
    this.pendingAction = {
      type: 'bar_choice',
      playerId: player.id,
      choices: [
        ...(canHire ? [{ id: 'hire', label: `Найняти помічника (1000$)` }] : []),
        { id: 'casino', label: 'Зіграти в рулетку' },
        { id: 'skip', label: 'Пропустити' }
      ],
      canHire,
      maxHelpers: respect.maxHelpers,
      currentHelpers: player.helpers.length
    };
    return { type: 'bar', pendingChoice: true };
  }

  executeBarChoice(playerId, choiceId) {
    const player = this.getPlayer(playerId);
    if (choiceId === 'hire') {
      return this.hireHelper(playerId);
    }
    if (choiceId === 'casino') {
      this.pendingAction = {
        type: 'casino',
        playerId: player.id,
        phase: 'betting'
      };
      return { type: 'casino_open' };
    }
    this.pendingAction = null;
    return { type: 'bar_skipped' };
  }

  hireHelper(playerId) {
    const player = this.getPlayer(playerId);
    const respect = this.getRespectData(player.respectLevel);
    if (player.helpers.length >= respect.maxHelpers) return { error: 'Максимум помічників' };
    if (player.money < HELPER_HIRE_COST) return { error: 'Недостатньо коштів' };

    player.money -= HELPER_HIRE_COST;
    player.stats.moneySpent += HELPER_HIRE_COST;
    player.stats.helpersHired++;

    // Draw up to 3 face-down helper cards for blind selection
    const drawnHelpers = [];
    const cardsToDraw = Math.min(3, this.helperDeck.length);
    if (cardsToDraw === 0) return { error: 'Колода помічників порожня' };
    for (let i = 0; i < cardsToDraw; i++) {
      const h = this.drawHelperCard();
      if (h) drawnHelpers.push(h);
    }
    if (drawnHelpers.length === 0) return { error: 'Колода помічників порожня' };

    // If only 1 card available, auto-assign (no choice needed)
    if (drawnHelpers.length === 1) {
      const helper = drawnHelpers[0];
      player.helpers.push(helper);
      this.addLog(`${player.name} найняв помічника.`);
      if (player.helpers.length < respect.maxHelpers && player.money >= HELPER_HIRE_COST) {
        this.pendingAction = { type: 'hire_another', playerId, canHireMore: true };
        return { hired: helper, canHireMore: true };
      }
      this.pendingAction = null;
      return { hired: helper };
    }

    // Multiple cards: player must choose blindly
    this.pendingAction = {
      type: 'choose_hidden_helper',
      playerId,
      drawnHelpers
    };
    return { type: 'choose_hidden_helper', cardCount: drawnHelpers.length };
  }

  executeChooseHiddenHelper(playerId, cardIndex) {
    const player = this.getPlayer(playerId);
    if (!this.pendingAction || this.pendingAction.type !== 'choose_hidden_helper') {
      return { error: 'Немає очікуваного вибору помічника.' };
    }
    if (this.pendingAction.playerId !== playerId) return { error: 'Не ваш хід.' };
    const drawnHelpers = this.pendingAction.drawnHelpers;
    if (cardIndex < 0 || cardIndex >= drawnHelpers.length) return { error: 'Невірний вибір.' };

    const chosenHelper = drawnHelpers[cardIndex];
    player.helpers.push(chosenHelper);
    this.addLog(`${player.name} найняв помічника.`);

    // Return unchosen cards to bottom of deck
    for (let i = 0; i < drawnHelpers.length; i++) {
      if (i !== cardIndex) this.returnHelperToDeck(drawnHelpers[i]);
    }

    const respect = this.getRespectData(player.respectLevel);
    if (player.helpers.length < respect.maxHelpers && player.money >= HELPER_HIRE_COST) {
      this.pendingAction = { type: 'hire_another', playerId, canHireMore: true };
      return { hired: chosenHelper, canHireMore: true };
    }
    this.pendingAction = null;
    return { hired: chosenHelper };
  }

  // --- CASINO / ROULETTE ---
  // Simplified: 12 sectors (5 red, 5 black, 2 green). Green = JACKPOT on any bet.
  playCasino(playerId, betType, betAmount) {
    const player = this.getPlayer(playerId);
    const bet = CASINO.betTypes.find(b => b.id === betType);
    if (!bet) return { error: 'Невідомий тип ставки' };
    if (betAmount < CASINO.minBet || betAmount > CASINO.maxBet) return { error: 'Некоректна ставка' };
    if (player.money < betAmount) return { error: 'Недостатньо коштів' };

    player.money -= betAmount;
    player.stats.moneySpent += betAmount;

    // Spin — pick random sector from the 12-sector wheel
    const sectorIndex = Math.floor(Math.random() * CASINO.sectors.length);
    const sectorColor = CASINO.sectors[sectorIndex];

    // Green = JACKPOT (free business) regardless of bet type
    if (sectorColor === 'green') {
      player.money += betAmount; // refund the bet
      this.addLog(`${player.name} зірвав MAFIA JACKPOT!!!`);
      this.pendingAction = {
        type: 'jackpot_choose_business',
        playerId
      };
      return { type: 'jackpot', sectorIndex, sectorColor, won: true };
    }

    // Red/Black — if bet matches sector color, win x2
    if (sectorColor === betType) {
      const winnings = betAmount * bet.payout;
      player.money += winnings;
      player.stats.moneyEarned += winnings;
      player.stats.casinoWins++;
      this.addLog(`${player.name} виграв ${winnings}$ у казино!`);
      this.pendingAction = null;
      return { type: 'casino_result', sectorIndex, sectorColor, won: true, winnings };
    }

    // Lost
    player.stats.casinoLosses++;
    this.addLog(`${player.name} програв ${betAmount}$ у казино.`);
    this.pendingAction = null;
    return { type: 'casino_result', sectorIndex, sectorColor, won: false, lost: betAmount };
  }

  // --- ATTACKS ---
  playMafiaCard(attackerId, cardId, targetId, options = {}) {
    const attacker = this.getPlayer(attackerId);
    const card = attacker.mafiaCards.find(c => c.id === cardId);
    if (!card) return { error: 'Карту не знайдено' };

    // Limit mafia cards per turn: level 5+ can play 2, others only 1
    const maxCardsPerTurn = this.getRespectData(attacker.respectLevel).level >= 5 ? 2 : 1;
    if ((attacker._mafiaCardPlayedThisTurn || 0) >= maxCardsPerTurn) {
      return { error: `Можна зіграти лише ${maxCardsPerTurn} карт(у) мафії за хід!` };
    }

    // Round restriction check — attack and certain cards blocked before minRound
    const currentRound = this.getCurrentRound();
    if (card.type === 'attack' && currentRound < this.mafiaCardMinRound) {
      return { error: `Карти атаки можна використовувати з ${this.mafiaCardMinRound}-го кола! (зараз коло ${currentRound})` };
    }

    const target = targetId ? this.getPlayer(targetId) : null;

    // Validate attack conditions
    if (card.type === 'attack') {
      if (!target || !target.alive) return { error: 'Неправильна ціль' };
      if (target.id === attacker.id) return { error: 'Не можна атакувати себе' };
      if (this.areAllied(attacker.id, target.id)) return { error: 'Не можна атакувати союзника!' };
      if (target._immuneUntilTurn && this.turnNumber < target._immuneUntilTurn) return { error: 'Гравець під захистом свідків!' };

      // Prison check: only bribe_inmates works on prisoners
      if (target.inPrison > 0 && card.id !== 'bribe_inmates') {
        return { error: "Гравець у в'язниці. Використовуйте 'Підкуп співкамерників'." };
      }
      if (card.id === 'bribe_inmates' && target.inPrison <= 0) {
        return { error: "Ця карта працює тільки проти ув'язнених." };
      }

      // Distance check for sniper
      if (card.id === 'sniper') {
        const dist = this.getDistance(attacker.position, target.position);
        if (dist > 5) return { error: 'Ціль занадто далеко (макс 5 клітин).' };
      }

      // Same district check
      if (card.requireSameDistrict) {
        if (!this.areInSameDistrict(attacker.position, target.position) &&
            attacker.position !== target.position) {
          return { error: 'Потрібно бути в одному районі або на одному секторі.' };
        }
      }

      // Calculate cost
      const cost = this.getAttackCost(attacker, card.cost);
      if (attacker.money < cost) return { error: 'Недостатньо коштів для замаху.' };

      // Remove card and pay
      attacker.mafiaCards = attacker.mafiaCards.filter(c => c !== card);
      this.mafiaDiscard.push(card);
      attacker.money -= cost;
      attacker.stats.moneySpent += cost;
      attacker.stats.attacksMade++;
      attacker.stats.mafiaCardsUsed++;

      this.addLog(`${attacker.name} використовує ${card.name} проти ${target.name}! (${cost}$)`);

      // --- Special attack cards that don't use standard attack_reaction ---
      if (card.id === 'arson') {
        // Arson: destroy 1 business owned by target in current district
        const district = this.getDistrictByPosition(attacker.position);
        if (!district) {
          attacker._mafiaCardPlayedThisTurn = (attacker._mafiaCardPlayedThisTurn || 0) + 1;
          return { error: 'Ви не в районі з бізнесами.' };
        }
        const targetBizInDistrict = target.businesses.filter(bid => {
          const biz = this.businesses[bid];
          return biz && biz.districtId === district.id;
        });
        if (targetBizInDistrict.length === 0) {
          attacker._mafiaCardPlayedThisTurn = (attacker._mafiaCardPlayedThisTurn || 0) + 1;
          return { error: 'У цілі немає бізнесу в цьому районі.' };
        }
        // If target can police-block, set up reaction
        if (card.canPolice && target.mafiaCards.some(c => c.id === 'police_card')) {
          this.pendingAction = {
            type: 'attack_reaction', attackerId: attacker.id, targetId: target.id,
            card, cost,
            canVest: false, canPolice: true,
            canBuyOff: card.canBuyOff && this.canPlayerBuyOff(target, cost),
            buyOffCost: (cost + BUYOFF_EXTRA) * (this.hasHelper(attacker.id, 'doubleBuyOff') ? 2 : 1), timeLimit: 12000
          };
          attacker._mafiaCardPlayedThisTurn = (attacker._mafiaCardPlayedThisTurn || 0) + 1;
          return { type: 'attack_initiated', card, target: target.id, pendingReaction: true };
        }
        // No reaction possible — resolve immediately: destroy first business
        const bizToDestroy = targetBizInDistrict[0];
        this.businesses[bizToDestroy].owner = null;
        this.businesses[bizToDestroy].influenceLevel = 0;
        target.businesses = target.businesses.filter(b => b !== bizToDestroy);
        const bizName = this.getBusiness(bizToDestroy)?.name || bizToDestroy;
        this.addLog(`${bizName} знищено підпалом!`);
        attacker._mafiaCardPlayedThisTurn = (attacker._mafiaCardPlayedThisTurn || 0) + 1;
        return { type: 'arson_done', businessId: bizToDestroy };
      }

      if (card.id === 'street_fight') {
        // Duel: both roll a die, higher wins 1000$ from loser
        const attackRoll = Math.floor(Math.random() * 6) + 1;
        const defenseRoll = Math.floor(Math.random() * 6) + 1;
        const prize = 1000;
        if (attackRoll > defenseRoll) {
          const take = Math.min(prize, target.money);
          target.money -= take;
          attacker.money += take;
          this.addLog(`Бійка! ${attacker.name} (${attackRoll}) vs ${target.name} (${defenseRoll}) — ${attacker.name} виграє ${take}$!`);
          attacker._mafiaCardPlayedThisTurn = (attacker._mafiaCardPlayedThisTurn || 0) + 1;
          return { type: 'street_fight_result', attackRoll, defenseRoll, winner: attacker.id, amount: take };
        } else if (defenseRoll > attackRoll) {
          const take = Math.min(prize, attacker.money);
          attacker.money -= take;
          target.money += take;
          this.addLog(`Бійка! ${attacker.name} (${attackRoll}) vs ${target.name} (${defenseRoll}) — ${target.name} виграє ${take}$!`);
          attacker._mafiaCardPlayedThisTurn = (attacker._mafiaCardPlayedThisTurn || 0) + 1;
          return { type: 'street_fight_result', attackRoll, defenseRoll, winner: target.id, amount: take };
        } else {
          this.addLog(`Бійка! ${attacker.name} (${attackRoll}) vs ${target.name} (${defenseRoll}) — Нічия!`);
          attacker._mafiaCardPlayedThisTurn = (attacker._mafiaCardPlayedThisTurn || 0) + 1;
          return { type: 'street_fight_result', attackRoll, defenseRoll, winner: null, amount: 0 };
        }
      }

      // Set up pending reaction for the target
      this.pendingAction = {
        type: 'attack_reaction',
        attackerId: attacker.id,
        targetId: target.id,
        card,
        cost,
        canVest: card.canDodge && target.mafiaCards.some(c => c.id === 'vest'),
        canPolice: card.canPolice && target.mafiaCards.some(c => c.id === 'police_card'),
        canBuyOff: card.canBuyOff && this.canPlayerBuyOff(target, cost),
        buyOffCost: (cost + BUYOFF_EXTRA) * (this.hasHelper(attacker.id, 'doubleBuyOff') ? 2 : 1),
        timeLimit: 12000 // 12 seconds
      };

      attacker._mafiaCardPlayedThisTurn = (attacker._mafiaCardPlayedThisTurn || 0) + 1;
      return { type: 'attack_initiated', card, target: target.id, pendingReaction: true };
    }

    // Non-attack mafia cards
    const nonAttackResult = this.playNonAttackMafiaCard(attacker, card, target, options);
    if (!nonAttackResult.error) {
      attacker._mafiaCardPlayedThisTurn = (attacker._mafiaCardPlayedThisTurn || 0) + 1;
      attacker.stats.mafiaCardsUsed++;
    }
    return nonAttackResult;
  }

  playNonAttackMafiaCard(player, card, target, options) {
    // Remove card from hand
    player.mafiaCards = player.mafiaCards.filter(c => c !== card);
    this.mafiaDiscard.push(card);

    switch (card.id) {
      case 'robbery':
        // Handled during rent payment
        return { error: 'Пограбування використовується під час оплати.' };

      case 'raider':
        return this.executeRaider(player);

      case 'pogrom':
        return this.executePogrom(player);

      case 'lawyer':
        if (player.inPrison > 0) {
          player.inPrison = 0;
          this.addLog(`${player.name} вийшов з в'язниці завдяки адвокату!`);
          return { type: 'lawyer_used' };
        }
        return { error: "Ви не у в'язниці." };

      case 'confession':
        return { error: 'Ця карта грається автоматично при витягуванні.' };

      case 'rumors':
        if (!target) return { error: 'Оберіть ціль.' };
        this.loseRespect(target);
        this.addLog(`${player.name} розпустив чутки про ${target.name}!`);
        return { type: 'rumors_used', target: target.id };

      case 'kompromat':
        if (!target) return { error: 'Оберіть ціль.' };
        this.sendToPrison(target, 2);
        this.addLog(`${player.name} використав компромат проти ${target.name}!`);
        return { type: 'kompromat_used', target: target.id };

      case 'bomb':
        this.bombs.push({ sector: player.position, placedBy: player.id });
        this.addLog(`${player.name} встановив бомбу!`);
        return { type: 'bomb_placed', sector: player.position };

      case 'informer':
        if (!target) return { error: 'Оберіть ціль.' };
        // Return target's mafia cards to the requesting player
        this.addLog(`${player.name} використав Інформатора проти ${target.name}!`);
        return { type: 'informer_used', target: target.id, cards: target.mafiaCards.map(c => ({ id: c.id, name: c.name, type: c.type })) };

      case 'tax_collector':
        let totalCollected = 0;
        for (const p of this.getAlivePlayers()) {
          if (p.id === player.id) continue;
          const tax = Math.min(500, p.money);
          p.money -= tax;
          p.stats.moneySpent += tax;
          totalCollected += tax;
        }
        player.money += totalCollected;
        player.stats.moneyEarned += totalCollected;
        this.addLog(`${player.name} зібрав данину: ${totalCollected}$ з усіх гравців!`);
        return { type: 'tax_collected', amount: totalCollected };

      case 'sabotage':
        if (!options.businessId) return { error: 'Оберіть бізнес.' };
        const sabBiz = this.businesses[options.businessId];
        if (!sabBiz || !sabBiz.owner || sabBiz.owner === player.id) return { error: 'Невірний бізнес.' };
        if (sabBiz.influenceLevel <= 0) return { error: 'У бізнесу немає впливу.' };
        sabBiz.influenceLevel--;
        this.addLog(`${player.name} зруйнував вплив на ${this.getBusiness(options.businessId)?.name}!`);
        return { type: 'sabotage_done', businessId: options.businessId };

      case 'witness_protection':
        player._immuneUntilTurn = this.turnNumber + 2;
        this.addLog(`${player.name} під захистом свідків на 2 ходи!`);
        return { type: 'witness_protection_active' };

      case 'double_agent':
        if (!target) return { error: 'Оберіть ціль.' };
        if (target.helpers.length === 0) return { error: 'У гравця немає помічників.' };
        const respect = this.getRespectData(player.respectLevel);
        if (player.helpers.length >= respect.maxHelpers) return { error: 'У вас максимум помічників.' };
        const stolenHelper = target.helpers.pop();
        player.helpers.push(stolenHelper);
        this.addLog(`${player.name} переманив ${stolenHelper.name} від ${target.name}!`);
        return { type: 'double_agent_used', helper: stolenHelper.name };

      case 'insurance':
        // Refund half of last rent paid this turn
        const lastRent = player._lastRentPaid || 0;
        if (lastRent === 0) return { error: 'Ви не платили ренту цей хід.' };
        const refund = Math.floor(lastRent / 2);
        player.money += refund;
        player.stats.moneyEarned += refund;
        player._lastRentPaid = 0;
        this.addLog(`${player.name} повернув ${refund}$ за страховкою!`);
        return { type: 'insurance_refund', amount: refund };

      case 'blackmail':
        if (!target) return { error: 'Оберіть ціль.' };
        const extortion = Math.floor(target.money * 0.3);
        target.money -= extortion;
        target.stats.moneySpent += extortion;
        player.money += extortion;
        player.stats.moneyEarned += extortion;
        this.addLog(`${player.name} шантажує ${target.name} на ${extortion}$!`);
        return { type: 'blackmail_done', amount: extortion };

      // --- WAVE 2 CARDS ---
      case 'forgery':
        player._interceptRent = true;
        this.addLog(`${player.name} підробив документи — наступна рента йде йому!`);
        return { type: 'forgery_active' };

      case 'corruption':
        player._corruptionTurns = 3;
        this.addLog(`${player.name} підкупив поліцію на 3 ходи!`);
        return { type: 'corruption_active' };

      case 'money_laundering':
        player._doubleIncome = (player._doubleIncome || 0) + 1;
        this.addLog(`${player.name} відмиває гроші — подвійний дохід з бізнесів на 1 коло!`);
        return { type: 'money_laundering_active' };

      case 'fake_death':
        player._fakeDeathActive = true;
        this.addLog(`${player.name} підготував інсценування смерті!`);
        return { type: 'fake_death_active' };

      case 'wiretap':
        if (!target) return { error: 'Оберіть ціль.' };
        this.addLog(`${player.name} прослуховує ${target.name}!`);
        return {
          type: 'wiretap_result', target: target.id,
          cards: target.mafiaCards.map(c => ({ id: c.id, name: c.name, type: c.type })),
          money: target.money,
          helpers: target.helpers.map(h => ({ name: h.name, ability: h.ability })),
          businesses: target.businesses
        };

      case 'hostile_takeover':
        if (!options.businessId) return { error: 'Оберіть бізнес для поглинання.' };
        const htBiz = this.businesses[options.businessId];
        if (!htBiz || !htBiz.owner || htBiz.owner === player.id) return { error: 'Невірний бізнес.' };
        const htBizData = this.getBusiness(options.businessId);
        if (!htBizData) return { error: 'Бізнес не знайдено.' };
        const htCost = htBizData.price * 2;
        if (player.money < htCost) return { error: `Потрібно ${htCost}$ для поглинання.` };
        const prevOwner = this.getPlayer(htBiz.owner);
        player.money -= htCost;
        player.stats.moneySpent += htCost;
        if (prevOwner) {
          prevOwner.money += htCost;
          prevOwner.stats.moneyEarned += htCost;
          prevOwner.businesses = prevOwner.businesses.filter(b => b !== options.businessId);
        }
        htBiz.owner = player.id;
        player.businesses.push(options.businessId);
        this.addLog(`${player.name} поглинув ${htBizData.name} за ${htCost}$!`);
        return { type: 'hostile_takeover_done', businessId: options.businessId, cost: htCost };

      default:
        return { error: 'Невідома дія.' };
    }
  }

  resolveAttackReaction(targetId, reactionType) {
    const action = this.pendingAction;
    if (!action || action.type !== 'attack_reaction') return { error: 'Немає активного замаху.' };
    if (action.targetId !== targetId) return { error: 'Це не ваш замах.' };

    const target = this.getPlayer(targetId);
    const attacker = this.getPlayer(action.attackerId);
    const card = action.card;

    switch (reactionType) {
      case 'vest': {
        if (!action.canVest) return { error: 'Немає бронежилету.' };
        const vestIdx = target.mafiaCards.findIndex(c => c.id === 'vest');
        target.mafiaCards.splice(vestIdx, 1);
        this.addLog(`${target.name} використав бронежилет!`);
        this.pendingAction = null;
        return { type: 'attack_blocked', by: 'vest' };
      }

      case 'police': {
        if (!action.canPolice) return { error: 'Немає карти поліції.' };
        const policeIdx = target.mafiaCards.findIndex(c => c.id === 'police_card');
        target.mafiaCards.splice(policeIdx, 1);
        this.sendToPrison(attacker, 2);
        this.addLog(`${target.name} викликав поліцію! ${attacker.name} їде у в'язницю!`);
        this.pendingAction = null;
        return { type: 'attack_blocked', by: 'police', attackerPrisoned: true };
      }

      case 'buyoff': {
        if (!action.canBuyOff) return { error: 'Не можете відкупитися.' };
        if (target.money < action.buyOffCost) return { error: 'Недостатньо коштів.' };
        target.money -= action.buyOffCost;
        this.addLog(`${target.name} відкупився від замаху за ${action.buyOffCost}$!`);
        this.pendingAction = null;
        return { type: 'attack_bought_off', cost: action.buyOffCost };
      }

      case 'none':
      default:
        return this.executeAttack(attacker, target, card);
    }
  }

  executeAttack(attacker, target, card) {
    // Fake death: blocks attack and wastes attacker's card
    if (target._fakeDeathActive) {
      target._fakeDeathActive = false;
      this.addLog(`${target.name} інсценував свою смерть! Замах ${attacker.name} провалився!`);
      this.pendingAction = null;
      return { type: 'fake_death_triggered' };
    }

    // Arson resolve (after reaction passed): destroy business
    if (card.id === 'arson' && card.destroysBusiness) {
      const district = this.getDistrictOfSector(attacker.position);
      const targetBiz = target.businesses.find(bid => {
        const biz = this.businesses[bid];
        return biz && biz.districtId === district;
      });
      if (targetBiz) {
        this.businesses[targetBiz].owner = null;
        this.businesses[targetBiz].influenceLevel = 0;
        target.businesses = target.businesses.filter(b => b !== targetBiz);
        const bizName = this.getBusiness(targetBiz)?.name || targetBiz;
        this.addLog(`${bizName} знищено підпалом!`);
      }
      this.pendingAction = null;
      return { type: 'arson_done' };
    }

    // Poison: 50% chance
    if (card.id === 'poison') {
      const dice = rollDice(1);
      if (dice[0] <= 3) {
        this.addLog(`Отрута спрацювала! (кубик: ${dice[0]})`);
      } else {
        this.addLog(`Отрута не спрацювала! (кубик: ${dice[0]})`);
        this.pendingAction = null;
        return { type: 'poison_failed', dice };
      }
    }

    // Car bomb: kills 1 helper + damages boss
    if (card.id === 'car_bomb') {
      if (target.helpers.length > 0) {
        const helper = target.helpers.pop();
        this.returnHelperToDeck(helper);
        this.addLog(`Автомобільна бомба знищила ${helper.name} у ${target.name}!`);
      }
      if (target.helpers.length === 0) {
        this.killBoss(target, 'car_bomb');
      }
      this.checkCounterAttack(attacker, target);
      this.pendingAction = null;
      return { type: 'car_bomb_result' };
    }

    // Massacre: kills 2 helpers
    if (card.id === 'massacre') {
      const killed = Math.min(2, target.helpers.length);
      for (let i = 0; i < killed; i++) {
        const helper = target.helpers.pop();
        this.returnHelperToDeck(helper);
      }
      this.addLog(`Бійня! ${killed} помічник(ів) ${target.name} загинуло.`);
      // Check Baby Flemmi counter-attack
      this.checkCounterAttack(attacker, target);
      this.checkAfterKill(attacker, target, killed > 0);
      this.pendingAction = null;
      return { type: 'massacre_result', killed };
    }

    // Regular attack: target is helper first, then boss
    if (target.helpers.length > 0) {
      // Survivor Joe check
      if (this.hasHelper(target.id, 'surviveOnce') && target.helperStates.survivorJoeActive) {
        target.helperStates.survivorJoeActive = false;
        // Survivor Joe dies saving his boss
        const joeIdx = target.helpers.findIndex(h => h.ability === 'surviveOnce');
        if (joeIdx >= 0) {
          const joe = target.helpers.splice(joeIdx, 1)[0];
          this.returnHelperToDeck(joe);
        }
        this.addLog(`Живучий Джо пожертвував собою заради ${target.name}!`);
        this.checkCounterAttack(attacker, target);
        this.pendingAction = null;
        return { type: 'attack_survived', by: 'survivor_joe' };
      }

      // Kill a helper (attacker chooses which)
      this.pendingAction = {
        type: 'choose_kill_helper',
        attackerId: attacker.id,
        targetId: target.id,
        targetHelpers: target.helpers.map(h => ({ name: h.name, id: h.id })),
        card
      };
      return { type: 'choose_helper_to_kill', targetHelpers: target.helpers.map(h => h.name) };
    }

    // No helpers — kill the boss
    this.killBoss(target, card.id);
    this.checkAfterKill(attacker, target, true);
    this.pendingAction = null;
    return { type: 'boss_killed', target: target.id };
  }

  executeChooseKillHelper(attackerId, targetId, helperIndex) {
    const target = this.getPlayer(targetId);
    const attacker = this.getPlayer(attackerId);
    if (helperIndex < 0 || helperIndex >= target.helpers.length) return { error: 'Невірний індекс.' };

    const helper = target.helpers.splice(helperIndex, 1)[0];
    this.addLog(`${helper.name} (помічник ${target.name}) загинув!`);
    this.returnHelperToDeck(helper);

    this.checkCounterAttack(attacker, target);
    this.checkAfterKill(attacker, target, true);
    this.pendingAction = null;
    return { type: 'helper_killed', helperName: helper.name };
  }

  checkCounterAttack(attacker, target) {
    // Baby Flemmi counter-attack
    if (this.hasHelper(target.id, 'counterAttack')) {
      const dice = rollDice(1);
      if (dice[0] <= 2) {
        this.addLog(`Малюк Флеммі вдарив у відповідь! (${dice[0]}) — атакуючий постраждав!`);
        if (attacker.helpers.length > 0) {
          const helper = attacker.helpers.pop();
          this.returnHelperToDeck(helper);
          this.addLog(`${helper.name} загинув від удару у відповідь!`);
        } else {
          this.killBoss(attacker, 'counter_attack');
        }
        return { counterAttack: true, dice };
      } else {
        this.addLog(`Малюк Флеммі промахнувся. (${dice[0]})`);
        return { counterAttack: false, dice };
      }
    }
    return { counterAttack: false };
  }

  checkAfterKill(attacker, target, success) {
    if (!success) return;
    // Willie "Ruthless": rob 1000$ on successful kill
    if (this.hasHelper(attacker.id, 'robOnKill')) {
      const amount = Math.min(1000, target.money);
      target.money -= amount;
      attacker.money += amount;
      this.addLog(`Віллі «Безжалісний» забрав ${amount}$ у ${target.name}!`);
    }
    // Tony "Fox": +1 influence
    if (this.hasHelper(attacker.id, 'influenceOnKill')) {
      const upgradeable = this.getUpgradeableBusinesses(attacker.id);
      if (upgradeable.length > 0) {
        this.pendingAction = {
          type: 'choose_influence_business',
          playerId: attacker.id,
          free: true,
          businesses: upgradeable,
          reason: 'tony_fox'
        };
      }
    }
  }

  killBoss(player, cause) {
    player.alive = false;
    this.addLog(`[X] ${player.name} був ліквідований! (${cause})`);

    // Return all businesses to free and reset influence
    for (const bizId of player.businesses) {
      if (this.businesses[bizId]) {
        this.businesses[bizId].owner = null;
        this.businesses[bizId].influenceLevel = 0;
      }
    }
    player.businesses = [];
    player.helpers = [];

    // Check win condition
    const alive = this.getAlivePlayers();
    if (alive.length === 1) {
      this.phase = 'finished';
      this.winner = alive[0];
      this.addLog(`🏆 ${alive[0].name} переміг! Він — справжній Дон!`);
    }
  }

  // --- SURRENDER ---
  surrender(playerId) {
    const player = this.getPlayer(playerId);
    if (!player || !player.alive) return { error: 'Гравець не знайдений або вже вибув.' };
    player.alive = false;
    // Return all businesses to free
    for (const bizId of player.businesses) {
      if (this.businesses[bizId]) {
        this.businesses[bizId].owner = null;
        this.businesses[bizId].influenceLevel = 0;
      }
    }
    player.businesses = [];
    player.helpers = [];
    this.addLog(`\uD83D\uDCA8 ${player.name} здався та вибув з гри!`);
    // Check win condition
    const alive = this.getAlivePlayers();
    if (alive.length === 1) {
      this.phase = 'finished';
      this.winner = alive[0];
      this.addLog(`\uD83C\uDFC6 ${alive[0].name} переміг! Він — справжній Дон!`);
    }
    return { surrendered: true };
  }

  // --- INFLUENCE ---
  buyInfluence(playerId, businessId) {
    const player = this.getPlayer(playerId);
    // Stanley Pollak per-turn limit
    if (this.hasHelper(playerId, 'cheaperInfluence') && player._usedStanleyThisTurn) {
      return { error: 'Стенлі Поляк може купити вплив лише 1 раз за хід.' };
    }
    const bizState = this.businesses[businessId];
    if (!bizState || bizState.owner !== playerId) return { error: 'Це не ваш бізнес.' };
    if ((bizState.influenceLevel || 0) >= 4) return { error: 'Максимальний рівень впливу (4).' };

    const district = this.getDistrict(bizState.districtId);
    if (!district) return { error: 'Район не знайдено.' };

    let cost = district.influenceCost;
    if (this.hasHelper(playerId, 'cheaperInfluence')) cost -= 500;
    cost = Math.max(0, cost);

    if (player.money < cost) return { error: 'Недостатньо коштів.' };

    player.money -= cost;
    bizState.influenceLevel = (bizState.influenceLevel || 0) + 1;

    this.addLog(`${player.name} збільшив вплив на ${this.getBusiness(businessId).name} (${cost}$). Рівень: ${bizState.influenceLevel}`);
    // Mark Stanley Pollak as used this turn
    if (this.hasHelper(playerId, 'cheaperInfluence')) {
      player._usedStanleyThisTurn = true;
    }
    return { success: true, cost, newLevel: bizState.influenceLevel };
  }

  // Try to buy business through influence dominance
  buyBusinessByInfluence(playerId, businessId) {
    const player = this.getPlayer(playerId);
    const biz = this.getBusiness(businessId);
    if (!biz) return { error: 'Бізнес не знайдено.' };

    const districtId = biz.districtId;
    const bizState = this.businesses[businessId];

    // Must be standing on this specific business's sector
    const sector = this.getSector(player.position);
    if (sector.type !== 'business') {
      return { error: 'Потрібно стояти на секторі бізнесу.' };
    }
    const sectorDistrict = this.getDistrict(sector.districtId);
    const sectorBiz = sectorDistrict ? sectorDistrict.businesses[sector.businessIndex] : null;
    if (!sectorBiz || sectorBiz.id !== businessId) {
      return { error: 'Потрібно стояти на цьому бізнесі.' };
    }

    if (!bizState.owner || bizState.owner === playerId) {
      return { error: 'Не можна викупити цей бізнес.' };
    }

    // Compare total influence in district
    const playerTotalStars = this.getPlayerInfluenceInDistrict(playerId, districtId);
    const ownerTotalStars = this.getPlayerInfluenceInDistrict(bizState.owner, districtId);

    if (playerTotalStars <= ownerTotalStars) {
      return { error: 'У вас недостатньо впливу в цьому районі для викупу.' };
    }

    const owner = this.getPlayer(bizState.owner);
    if (player.money < biz.price) return { error: 'Недостатньо коштів.' };

    player.money -= biz.price;
    owner.money += biz.price;
    owner.businesses = owner.businesses.filter(b => b !== businessId);
    bizState.owner = playerId;
    bizState.influenceLevel = 1; // Reset influence on bought business
    player.businesses.push(businessId);

    this.addLog(`${player.name} викупив ${biz.name} у ${owner.name} через вплив!`);
    return { success: true };
  }

  // --- RESPECT ---
  upgradeRespect(playerId) {
    const player = this.getPlayer(playerId);
    if (!player.canUpgradeRespect) return { error: 'Немає права на підвищення. Пройдіть START.' };
    if (player.respectLevel >= 5) return { error: 'Максимальний рівень.' };

    const nextLevel = RESPECT_LEVELS.find(r => r.level === player.respectLevel + 1);
    let cost = nextLevel.upgradeCost;
    if (this.hasHelper(playerId, 'cheaperRespect')) cost -= 1000;
    cost = Math.max(0, cost);

    if (player.money < cost) return { error: 'Недостатньо коштів.' };

    player.money -= cost;
    player.respectLevel++;
    player.canUpgradeRespect = false;
    this.addLog(`${player.name} підвищив повагу до "${nextLevel.name}" (${cost}$).`);
    return { success: true, newLevel: player.respectLevel, name: nextLevel.name };
  }

  loseRespect(player) {
    if (player.respectLevel <= 1) return;
    player.respectLevel--;
    const respect = this.getRespectData(player.respectLevel);
    this.addLog(`${player.name} втратив повагу! Тепер: "${respect.name}".`);

    // Check helper limit
    while (player.helpers.length > respect.maxHelpers) {
      const removed = player.helpers.pop();
      this.returnHelperToDeck(removed);
      this.addLog(`${removed.name} був звільнений через втрату поваги.`);
    }
  }

  // --- PRISON ---
  sendToPrison(player, turns) {
    player.inPrison = turns;
    player.position = 29; // PRISON sector
    player.stats.timesInPrison++;
    this.addLog(`${player.name} відправлений у в'язницю на ${turns} ходів.`);
  }

  // --- RAIDER / POGROM ---
  executeRaider(player) {
    const sector = this.getSector(player.position);
    if (sector.type !== 'business') return { error: 'Потрібно стояти на секторі бізнесу.' };
    const district = this.getDistrict(sector.districtId);
    const biz = district.businesses[sector.businessIndex];
    const bizState = this.businesses[biz.id];
    if (!bizState.owner || bizState.owner === player.id) return { error: 'Бізнес не належить суперникові.' };

    const owner = this.getPlayer(bizState.owner);
    owner.businesses = owner.businesses.filter(b => b !== biz.id);
    bizState.owner = player.id;
    player.businesses.push(biz.id);
    // Set influence on the captured business
    this.businesses[biz.id].influenceLevel = 1;

    this.addLog(`${player.name} здійснив рейдерське захоплення ${biz.name}!`);
    return { type: 'raider_success', business: biz.name };
  }

  executePogrom(player) {
    const sector = this.getSector(player.position);
    if (sector.type !== 'business') return { error: 'Потрібно стояти на секторі бізнесу.' };
    const district = this.getDistrict(sector.districtId);
    const biz = district.businesses[sector.businessIndex];
    const bizState = this.businesses[biz.id];
    if (!bizState.owner) return { error: 'Бізнес нікому не належить.' };

    const owner = this.getPlayer(bizState.owner);
    owner.businesses = owner.businesses.filter(b => b !== biz.id);
    // Reset influence when business is freed
    this.businesses[biz.id].influenceLevel = 0;
    bizState.owner = null;

    this.addLog(`${player.name} влаштував погром ${biz.name}! Бізнес вільний.`);
    return { type: 'pogrom_success', business: biz.name };
  }

  // --- MAD DOG (free ambush) ---
  useMadDogAmbush(attackerId, targetId) {
    const attacker = this.getPlayer(attackerId);
    if (!this.hasHelper(attackerId, 'freeAmbush')) return { error: 'Немає "Скаженого Пса".' };
    if (attacker._usedMadDogThisTurn) return { error: '«Скажений Пес» може атакувати лише 1 раз за хід.' };
    const target = this.getPlayer(targetId);
    if (!target || !target.alive) return { error: 'Неправильна ціль.' };

    if (!this.areInSameDistrict(attacker.position, target.position)) {
      return { error: 'Потрібно бути в одному районі.' };
    }

    attacker._usedMadDogThisTurn = true;
    this.addLog(`«Скажений Пес» ${attacker.name} атакує ${target.name}!`);

    // Set up reaction
    this.pendingAction = {
      type: 'attack_reaction',
      attackerId: attacker.id,
      targetId: target.id,
      card: { id: 'mad_dog_ambush', name: 'Засідка (Скажений Пес)', type: 'attack', cost: 0 },
      cost: 0,
      isMadDog: true,
      canVest: target.mafiaCards.some(c => c.id === 'vest'),
      canPolice: target.mafiaCards.some(c => c.id === 'police_card'),
      canBuyOff: this.canPlayerBuyOff(target, 0),
      buyOffCost: BUYOFF_EXTRA * (this.hasHelper(attackerId, 'doubleBuyOff') ? 2 : 1),
      timeLimit: 12000
    };
    return { type: 'mad_dog_attack', pendingReaction: true };
  }

  // --- END TURN ---
  endTurn(playerId) {
    if (this.getCurrentPlayer().id !== playerId) return { error: 'Не ваш хід.' };
    if (this.pendingAction) return { error: 'Є незавершена дія.' };

    // Reset per-turn flags
    const currentPlayer = this.getPlayer(playerId);
    if (currentPlayer) {
      currentPlayer._usedStanleyThisTurn = false;
      currentPlayer._usedMadDogThisTurn = false;
      currentPlayer._mafiaCardPlayedThisTurn = 0;
      currentPlayer._usedExtraStepThisTurn = false;
      // Decrement money laundering rounds
      if (currentPlayer._doubleIncome && currentPlayer._doubleIncome > 0) {
        currentPlayer._doubleIncome--;
      }
    }

    // Cappo Corrado extra step handled separately
    this.turnPhase = 'roll';
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;

    // Skip dead or still-in-prison players
    let safety = 0;
    while (!this.getCurrentPlayer().alive && safety < this.players.length) {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
      safety++;
    }

    this.turnNumber++;
    // Tick alliances at end of each full round
    if (this.turnNumber % this.players.length === 0) this.tickAlliances();
    // Track rounds survived for all alive players
    for (const p of this.getAlivePlayers()) {
      p.stats.roundsSurvived = this.getCurrentRound();
    }
    const next = this.getCurrentPlayer();
    this.addLog(`Хід ${this.turnNumber}: ${next.name}`);

    // Check round limit
    const currentRound = this.getCurrentRound();
    if (currentRound > this.maxRounds) {
      const alive = this.getAlivePlayers();
      const richest = alive.sort((a, b) => {
        const aWealth = a.money + a.businesses.reduce((sum, bizId) => sum + (this.getBusiness(bizId)?.price || 0), 0);
        const bWealth = b.money + b.businesses.reduce((sum, bizId) => sum + (this.getBusiness(bizId)?.price || 0), 0);
        return bWealth - aWealth;
      })[0];
      this.phase = 'finished';
      this.winner = richest;
      this.addLog(`\u23F0 Гра закінчена після ${this.maxRounds} кіл! ${richest.name} переміг як найбагатший!`);
    }

    return { nextPlayer: next.id, turnNumber: this.turnNumber };
  }

  // --- UTILITY ---
  getDistance(pos1, pos2) {
    const d1 = (pos2 - pos1 + TOTAL_SECTORS) % TOTAL_SECTORS;
    const d2 = (pos1 - pos2 + TOTAL_SECTORS) % TOTAL_SECTORS;
    return Math.min(d1, d2);
  }

  areInSameDistrict(pos1, pos2) {
    const d1 = this.getDistrictOfSector(pos1);
    const d2 = this.getDistrictOfSector(pos2);
    return d1 && d2 && d1 === d2;
  }

  canPlayerBuyOff(player, attackCost) {
    const respect = this.getRespectData(player.respectLevel);
    if (!respect.canBuyOff) return false;
    return player.money >= (attackCost + BUYOFF_EXTRA);
  }

  getDistrictsWithBusiness(playerId) {
    const districts = new Set();
    const player = this.getPlayer(playerId);
    for (const bizId of player.businesses) {
      const biz = this.businesses[bizId];
      if (biz) districts.add(biz.districtId);
    }
    return [...districts];
  }

  getUpgradeableBusinesses(playerId) {
    const player = this.getPlayer(playerId);
    return player.businesses.filter(bizId => {
      const bs = this.businesses[bizId];
      return bs && bs.influenceLevel < 4;
    }).map(bizId => ({
      id: bizId,
      name: this.getBusiness(bizId).name,
      currentLevel: this.businesses[bizId].influenceLevel,
      districtId: this.businesses[bizId].districtId
    }));
  }

  useHelperAbility(playerId, helperAbility, data) {
    const player = this.getPlayer(playerId);
    if (!this.hasHelper(playerId, helperAbility)) return { error: 'Немає цього помічника.' };

    switch (helperAbility) {
      case 'buyInfluenceAnywhere': {
        // Stanley Pollak: buy influence on any owned business
        if (!data.businessId) return { error: 'Оберіть бізнес.' };
        if (player._usedStanleyThisTurn) return { error: 'Стенлі Поляк може купити вплив лише 1 раз за хід.' };
        const result = this.buyInfluence(playerId, data.businessId);
        if (result.success) {
          player._usedStanleyThisTurn = true;
        }
        return result;
      }
      default:
        return { error: 'Невідома здібність.' };
    }
  }

  // Sanitize pendingAction before sending to clients (hide secret data)
  _sanitizePendingAction(action) {
    if (!action) return action;
    if (action.type === 'choose_hidden_helper') {
      // Don't send helper names/details to client — only send the count
      return {
        type: action.type,
        playerId: action.playerId,
        cardCount: action.drawnHelpers ? action.drawnHelpers.length : 0
      };
    }
    return action;
  }

  // --- FULL STATE (for sending to clients) ---
  // --- TRADING ---
  createTradeOffer(fromId, toId, offer) {
    const from = this.getPlayer(fromId);
    const to = this.getPlayer(toId);
    if (!from || !to || !from.alive || !to.alive) return { error: 'Невірні гравці' };
    if (fromId === toId) return { error: 'Не можна торгувати з собою' };
    // Validate offer: { giveMoney, giveBusiness[], wantMoney, wantBusiness[] }
    if (offer.giveMoney && from.money < offer.giveMoney) return { error: 'Недостатньо грошей' };
    if (offer.giveBusiness) {
      for (const bizId of offer.giveBusiness) {
        if (!from.businesses.includes(bizId)) return { error: `Ви не володієте бізнесом ${bizId}` };
      }
    }
    if (offer.wantBusiness) {
      for (const bizId of offer.wantBusiness) {
        if (!to.businesses.includes(bizId)) return { error: `${to.name} не володіє бізнесом ${bizId}` };
      }
    }
    this.pendingAction = {
      type: 'trade_offer',
      fromId, toId,
      fromName: from.name, toName: to.name,
      offer,
      playerId: toId // who needs to respond
    };
    this.addLog(`${from.name} пропонує угоду ${to.name}!`);
    return { success: true };
  }

  executeTradeOffer(responderId, accept) {
    if (!this.pendingAction || this.pendingAction.type !== 'trade_offer') return { error: 'Немає пропозиції' };
    if (this.pendingAction.toId !== responderId) return { error: 'Не ваша угода' };
    const { fromId, toId, offer } = this.pendingAction;
    const from = this.getPlayer(fromId);
    const to = this.getPlayer(toId);
    if (!accept) {
      this.addLog(`${to.name} відхилив угоду з ${from.name}.`);
      this.pendingAction = null;
      return { success: true, declined: true };
    }
    // Validate again
    if (offer.giveMoney && from.money < offer.giveMoney) { this.pendingAction = null; return { error: 'Недостатньо грошей у відправника' }; }
    if (offer.wantMoney && to.money < offer.wantMoney) { this.pendingAction = null; return { error: 'Недостатньо грошей у отримувача' }; }
    // Execute swap
    if (offer.giveMoney) { from.money -= offer.giveMoney; to.money += offer.giveMoney; }
    if (offer.wantMoney) { to.money -= offer.wantMoney; from.money += offer.wantMoney; }
    if (offer.giveBusiness) {
      for (const bizId of offer.giveBusiness) {
        from.businesses = from.businesses.filter(b => b !== bizId);
        to.businesses.push(bizId);
        this.businesses[bizId].owner = toId;
      }
    }
    if (offer.wantBusiness) {
      for (const bizId of offer.wantBusiness) {
        to.businesses = to.businesses.filter(b => b !== bizId);
        from.businesses.push(bizId);
        this.businesses[bizId].owner = fromId;
      }
    }
    this.addLog(`${from.name} і ${to.name} уклали угоду!`);
    this.pendingAction = null;
    return { success: true, accepted: true };
  }

  // --- ALLIANCES ---
  createAlliance(fromId, toId, rounds = 3) {
    if (!this.alliances) this.alliances = [];
    const from = this.getPlayer(fromId);
    const to = this.getPlayer(toId);
    if (!from || !to) return { error: 'Невірні гравці' };
    // Check no existing alliance between them
    const existing = this.alliances.find(a =>
      a.active && ((a.player1 === fromId && a.player2 === toId) || (a.player1 === toId && a.player2 === fromId))
    );
    if (existing) return { error: 'Альянс вже існує' };
    this.pendingAction = {
      type: 'alliance_offer',
      fromId, toId,
      fromName: from.name, toName: to.name,
      rounds,
      playerId: toId
    };
    this.addLog(`${from.name} пропонує альянс ${to.name} на ${rounds} кола!`);
    return { success: true };
  }

  executeAllianceOffer(responderId, accept) {
    if (!this.pendingAction || this.pendingAction.type !== 'alliance_offer') return { error: 'Немає пропозиції' };
    if (this.pendingAction.toId !== responderId) return { error: 'Не ваша пропозиція' };
    const { fromId, toId, rounds } = this.pendingAction;
    const from = this.getPlayer(fromId);
    const to = this.getPlayer(toId);
    if (!accept) {
      this.addLog(`${to.name} відхилив альянс з ${from.name}.`);
      this.pendingAction = null;
      return { success: true, declined: true };
    }
    if (!this.alliances) this.alliances = [];
    this.alliances.push({
      player1: fromId, player2: toId,
      roundsLeft: rounds, startRound: this.getCurrentRound(), active: true
    });
    this.addLog(`${from.name} і ${to.name} уклали альянс на ${rounds} кола! Не можуть атакувати один одного.`);
    this.pendingAction = null;
    return { success: true, accepted: true };
  }

  tickAlliances() {
    if (!this.alliances) return;
    for (const a of this.alliances) {
      if (!a.active) continue;
      a.roundsLeft--;
      if (a.roundsLeft <= 0) {
        a.active = false;
        const p1 = this.getPlayer(a.player1);
        const p2 = this.getPlayer(a.player2);
        if (p1 && p2) this.addLog(`Альянс між ${p1.name} і ${p2.name} завершився.`);
      }
    }
  }

  areAllied(id1, id2) {
    if (!this.alliances) return false;
    return this.alliances.some(a => a.active && ((a.player1 === id1 && a.player2 === id2) || (a.player1 === id2 && a.player2 === id1)));
  }

  getState(forPlayerId = null) {
    return {
      roomId: this.roomId,
      hostId: this.hostId,
      phase: this.phase,
      turnPhase: this.turnPhase,
      currentPlayerIndex: this.currentPlayerIndex,
      currentPlayerId: this.phase === 'playing' ? this.getCurrentPlayer().id : null,
      orderRolls: this.phase === 'rolling_order' ? this.orderRolls : undefined,
      orderRollCurrentId: this.phase === 'rolling_order' && this.players[this.orderRollCurrent] ? this.players[this.orderRollCurrent].id : undefined,
      currentRound: this.getCurrentRound(),
      mafiaCardMinRound: this.mafiaCardMinRound,
      turnNumber: this.turnNumber,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        character: p.character,
        money: p.money,
        position: p.position,
        respectLevel: p.respectLevel,
        respectName: this.getRespectData(p.respectLevel).name,
        helpers: (forPlayerId === p.id) ? p.helpers.map(h => ({ id: h.id, name: h.name, ability: h.ability, passive: h.passive, description: h.description })) : undefined,
        helperCount: p.helpers.length,
        businessCount: p.businesses.length,
        businesses: p.businesses,
        inPrison: p.inPrison,
        alive: p.alive,
        isBot: p.isBot || false,
        canUpgradeRespect: p.canUpgradeRespect,
        mafiaCardCount: p.mafiaCards.length,
        _usedExtraStepThisTurn: p._usedExtraStepThisTurn || false,
        // Only show own mafia cards
        mafiaCards: (forPlayerId === p.id) ? p.mafiaCards : undefined,
        stats: p.stats,
        avatar: p.avatar || null
      })),
      businesses: { ...this.businesses },
      bombs: this.bombs.map(b => ({ sector: b.sector })), // Don't reveal who placed
      pendingAction: this._sanitizePendingAction(this.pendingAction),
      log: this.log.slice(-30),
      alliances: (this.alliances || []).filter(a => a.active).map(a => ({
        player1: a.player1, player2: a.player2, roundsLeft: a.roundsLeft
      })),
      winner: this.winner ? { id: this.winner.id, name: this.winner.name } : null,
      board: BOARD,
      boardGrid: BOARD_GRID,
      districts: DISTRICTS,
      respectLevels: RESPECT_LEVELS
    };
  }
}

module.exports = GameEngine;
