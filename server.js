// ============================================================
// MAFIA BUSINESS v2 — Server
// ============================================================
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const GameEngine = require('./game/GameEngine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// Prevent server crash on unhandled errors
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message, err.stack);
});
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});

// --- Room Management ---
const rooms = new Map(); // roomId -> GameEngine
const playerRooms = new Map(); // socketId -> roomId
const botCounters = new Map(); // roomId -> number (for unique bot IDs)
const BOT_NAMES = ['Бот Вінні', 'Бот Тоні', 'Бот Сальваторе', 'Бот Луїджі', 'Бот Марко', 'Бот Ніко', 'Бот Анджело', 'Бот Ренцо'];

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function scheduleOrderRolls(roomId) {
  const game = rooms.get(roomId);
  if (!game || game.phase !== 'rolling_order') return;
  const currentIdx = game.orderRollCurrent;
  if (currentIdx >= game.players.length) return; // all rolled
  const player = game.players[currentIdx];
  if (player.isBot) {
    setTimeout(() => {
      if (game.phase !== 'rolling_order') return;
      const result = game.rollForOrder(player.id);
      broadcastState(roomId);
      // Continue for next bots
      if (!result.error && !result.allRolled) {
        scheduleOrderRolls(roomId);
      }
      // If all rolled and game started, trigger first bot turn if needed
      if (result.allRolled && game.phase === 'playing') {
        const current = game.getCurrentPlayer();
        if (current.isBot) scheduleBotTurn(roomId);
      }
    }, 1500);
  }
}

function broadcastState(roomId) {
  const game = rooms.get(roomId);
  if (!game) return;
  try {
    const sockets = io.sockets.adapter.rooms.get(roomId);
    if (sockets) {
      for (const sid of sockets) {
        const socket = io.sockets.sockets.get(sid);
        if (socket) {
          socket.emit('gameState', game.getState(socket.id));
        }
      }
    }

    // Schedule bot turn if current player is a bot
    if (game.phase === 'playing') {
      const current = game.getCurrentPlayer();
      if (current && current.isBot && current.alive) {
        scheduleBotTurn(roomId);
      }

      // Handle pending actions that target bots (auctions, attack reactions)
      if (game.pendingAction) {
        handleBotPendingParticipation(roomId, game);
      }
    }
  } catch (err) {
    console.error('broadcastState error:', err.message, err.stack);
  }
}

function broadcastEvent(roomId, event, data) {
  io.to(roomId).emit(event, data);
}

// --- Bot AI ---
const botTurnTimers = new Map(); // roomId -> timeout

function scheduleBotTurn(roomId, extraDelay = 0) {
  // Prevent double-scheduling
  if (botTurnTimers.has(roomId)) return;
  const baseDelay = 1500 + Math.floor(Math.random() * 1000); // 1.5-2.5 seconds
  const delay = baseDelay + extraDelay;
  const timer = setTimeout(() => {
    botTurnTimers.delete(roomId);
    executeBotTurn(roomId);
  }, delay);
  botTurnTimers.set(roomId, timer);
}

function executeBotTurn(roomId) {
  const game = rooms.get(roomId);
  if (!game || game.phase !== 'playing') return;

  const current = game.getCurrentPlayer();
  if (!current || !current.isBot || !current.alive) return;
  const botId = current.id;

  // Phase: roll
  if (game.turnPhase === 'roll') {
    const result = game.rollDiceForPlayer(botId);
    if (!result) return;

    // Handle BAR action from wedding event
    if (result.barAction) {
      broadcastState(roomId);
      if (game.pendingAction) {
        scheduleBotTurn(roomId, 500);
      }
      return;
    }

    // Handle prison: if bot is in prison or just released, skip turn
    if (result.inPrison || result.released) {
      setTimeout(() => {
        game.endTurn(botId);
        broadcastState(roomId);
      }, 2000);
      broadcastState(roomId);
      return;
    }

    // Calculate animation delay based on steps moved
    let animDelay = 0;
    if (result.oldPos !== undefined && result.newPos !== undefined) {
      const steps = ((result.newPos - result.oldPos + 36) % 36) || 1;
      animDelay = steps * 350 + 800; // match client animation timing
    }

    broadcastState(roomId);

    // After broadcasting (which triggers client animation), wait for animation
    // before resolving pending action
    if (game.pendingAction || game.turnPhase === 'action') {
      // Clear the existing schedule and reschedule with animation delay
      if (botTurnTimers.has(roomId)) {
        clearTimeout(botTurnTimers.get(roomId));
        botTurnTimers.delete(roomId);
      }
      scheduleBotTurn(roomId, animDelay);
    }
    return;
  }

  // Phase: resolve pending action
  if (game.pendingAction) {
    resolveBotPendingAction(roomId, game, current);
    return;
  }

  // Phase: action with no pending action -> end turn (with small delay)
  if (game.turnPhase === 'action') {
    current.policeProtection = false;
    game.endTurn(botId);
    broadcastState(roomId);
    return;
  }
}

function resolveBotPendingAction(roomId, game, bot) {
  const action = game.pendingAction;
  if (!action) return;
  const botId = bot.id;

  switch (action.type) {
    case 'buy_business': {
      const biz = game.getBusiness(action.businessId);
      const shouldBuy = biz && biz.price <= bot.money * 0.6 && bot.money >= biz.price;
      game.executeBuyBusiness(botId, action.businessId, shouldBuy);
      break;
    }
    case 'pay_rent': {
      game.executePayRent(botId, false); // never use robbery
      break;
    }
    case 'seize_prison_business': {
      const biz = game.getBusiness(action.businessId);
      const shouldBuy = biz && biz.price <= bot.money * 0.6 && bot.money >= biz.price;
      game.executeSeizePrisonBusiness(botId, action.businessId, shouldBuy);
      break;
    }
    case 'upgrade_influence_on_own': {
      const bizData = game.getBusiness(action.businessId);
      const cost = bizData ? (bizData.price * 0.3) : Infinity; // approximate influence cost
      const shouldUpgrade = bot.money > cost * 1.5; // conservative: upgrade if cost < ~30% of money
      if (shouldUpgrade) {
        game.buyInfluence(botId, action.businessId);
      }
      game.pendingAction = null;
      break;
    }
    case 'police_landing_choice': {
      // Bot strategy: snitch on richest opponent 50% of the time, otherwise pay 500$
      const others = game.getAlivePlayers().filter(p => p.id !== botId && p.inPrison <= 0);
      if (others.length > 0 && Math.random() > 0.5) {
        const richest = others.sort((a, b) => b.money - a.money)[0];
        game.resolvePoliceChoice(botId, `snitch_${richest.id}`);
      } else {
        game.resolvePoliceChoice(botId, 'pay_500');
      }
      break;
    }
    case 'start_bonus_choice': {
      game.resolveStartBonusChoice(botId, 'extra_cash');
      if (game.pendingAction && game.pendingAction.type === 'choose_influence_business') {
        // If extra_cash somehow triggered this, handle it
        resolveBotPendingAction(roomId, game, bot);
        return;
      }
      break;
    }
    case 'bar_choice': {
      // Hire helper if affordable and has room
      const respect = game.getRespectData(bot.respectLevel);
      const canHire = bot.helpers.length < respect.maxHelpers && bot.money >= 1000;
      game.executeBarChoice(botId, canHire ? 'hire' : 'skip');
      break;
    }
    case 'choose_hidden_helper': {
      // Bot picks a random face-down card
      const drawnCount = action.drawnHelpers ? action.drawnHelpers.length : 3;
      const randomIdx = Math.floor(Math.random() * drawnCount);
      game.executeChooseHiddenHelper(botId, randomIdx);
      break;
    }
    case 'hire_another': {
      // Hire another helper if affordable
      const resp = game.getRespectData(bot.respectLevel);
      const canHireMore = bot.helpers.length < resp.maxHelpers && bot.money >= 1000;
      if (canHireMore) {
        game.hireHelper(botId);
      } else {
        game.pendingAction = null;
      }
      break;
    }
    case 'extra_step_choice': {
      // Bot decides: step forward if the next sector is a business they could buy, otherwise 50/50
      const nextSector = game.getSector(action.nextPos);
      const currentSector = game.getSector(action.currentPos);
      let useStep = Math.random() > 0.5; // default: random
      // Smart: if next sector is an unowned business, step forward
      if (nextSector && nextSector.type === 'business') {
        const dist = game.getDistrict(nextSector.districtId);
        const biz = dist ? dist.businesses[nextSector.businessIndex] : null;
        const bizState = biz ? game.businesses[biz.id] : null;
        if (bizState && !bizState.owner) useStep = true;
      }
      // Smart: if current sector is an unowned business, stay
      if (currentSector && currentSector.type === 'business') {
        const dist = game.getDistrict(currentSector.districtId);
        const biz = dist ? dist.businesses[currentSector.businessIndex] : null;
        const bizState = biz ? game.businesses[biz.id] : null;
        if (bizState && !bizState.owner) useStep = false;
      }
      game.resolveExtraStepChoice(bot.id, useStep);
      break;
    }
    case 'choose_influence_business': {
      // Pick first available business
      if (action.businesses && action.businesses.length > 0) {
        const bizId = action.businesses[0].id;
        const bizState = game.businesses[bizId];
        if (bizState) {
          bizState.influenceLevel = (bizState.influenceLevel || 0) + 1;
          game.addLog(`${bot.name} додав вплив на ${action.businesses[0].name}.`);
        }
      }
      game.pendingAction = null;
      break;
    }
    case 'choose_lose_helper': {
      if (bot.helpers.length > 0) {
        const idx = bot.helpers.length - 1;
        const helper = bot.helpers.splice(idx, 1)[0];
        game.returnHelperToDeck(helper);
        game.addLog(`${bot.name} втратив помічника ${helper.name}.`);
      }
      game.pendingAction = null;
      break;
    }
    case 'bomb_choose_helper': {
      if (bot.helpers.length > 0) {
        const idx = bot.helpers.length - 1;
        const helper = bot.helpers.splice(idx, 1)[0];
        game.returnHelperToDeck(helper);
        game.addLog(`${helper.name} загинув від вибуху бомби!`);
      }
      game.pendingAction = null;
      // After bomb damage is resolved, continue with deferred landing if any
      game.resolveDeferredLanding(bot.id);
      break;
    }
    case 'choose_kill_helper': {
      // Bot is the attacker, choose which target helper to kill
      const target = game.getPlayer(action.targetId);
      if (target && target.helpers.length > 0) {
        const idx = Math.floor(Math.random() * target.helpers.length);
        game.executeChooseKillHelper(action.attackerId, action.targetId, idx);
      } else {
        game.pendingAction = null;
      }
      break;
    }
    case 'pay_or_prison': {
      if (bot.money >= action.amount) {
        bot.money -= action.amount;
      } else {
        game.sendToPrison(bot, 2);
      }
      game.pendingAction = null;
      break;
    }
    case 'discard_mafia_cards': {
      const count = action.count || 1;
      const indices = [];
      for (let i = 0; i < count && i < bot.mafiaCards.length; i++) {
        indices.push(i);
      }
      indices.sort((a, b) => b - a);
      const removed = [];
      for (const idx of indices) {
        if (idx >= 0 && idx < bot.mafiaCards.length) {
          removed.push(...bot.mafiaCards.splice(idx, 1));
        }
      }
      game.mafiaDiscard.push(...removed);
      game.pendingAction = null;
      break;
    }
    case 'police_bonus_choice': {
      const player = game.getPlayer(botId);
      if (player) {
        player.policeProtection = true;
        game.addLog(`${player.name} під захистом поліції до наступного ходу.`);
      }
      game.pendingAction = null;
      break;
    }
    case 'auction': {
      // Bot bids on auction
      const minPrice = action.minPrice || 0;
      const bid = (bot.money >= minPrice) ? minPrice : 0;
      if (!action.bids) action.bids = {};
      action.bids[botId] = bid;
      // Check if all alive players have bid
      const alivePlayers = game.getAlivePlayers();
      const allBid = alivePlayers.every(p => action.bids.hasOwnProperty(p.id));
      if (allBid) {
        let winnerId = null, maxBid = 0;
        for (const [pid, b] of Object.entries(action.bids)) {
          if (b > maxBid) { maxBid = b; winnerId = pid; }
        }
        if (winnerId && maxBid >= action.minPrice) {
          const winner = game.getPlayer(winnerId);
          winner.money -= maxBid;
          game.businesses[action.businessId].owner = winnerId;
          game.businesses[action.businessId].influenceLevel = 1;
          winner.businesses.push(action.businessId);
          game.addLog(`${winner.name} виграв аукціон за ${action.businessName}: ${maxBid}$.`);
        } else {
          game.addLog(`Аукціон за ${action.businessName} не відбувся.`);
        }
        game.pendingAction = null;
      }
      break;
    }
    case 'attack_reaction': {
      // Try to pay off if possible
      if (action.canBuyOff && bot.money >= (action.buyOffCost || 0)) {
        game.resolveAttackReaction(botId, 'buyOff');
      } else if (action.canVest) {
        game.resolveAttackReaction(botId, 'vest');
      } else if (action.canPolice) {
        game.resolveAttackReaction(botId, 'police');
      } else {
        game.resolveAttackReaction(botId, 'nothing');
      }
      break;
    }
    case 'event_confirm': {
      game.executeEventConfirm(botId);
      break;
    }
    case 'mafia_confirm': {
      game.executeMafiaConfirm(botId);
      break;
    }
    case 'casino': {
      // Bot skips casino
      game.pendingAction = null;
      break;
    }
    default: {
      // Unknown action type - just clear it and move on
      game.pendingAction = null;
      break;
    }
  }

  broadcastState(roomId);

  // If resolving created a new pendingAction, re-schedule bot to handle it
  if (game.pendingAction) {
    const current = game.getCurrentPlayer();
    if (current && current.isBot && current.alive) {
      // Force re-schedule by clearing existing timer
      if (botTurnTimers.has(roomId)) {
        clearTimeout(botTurnTimers.get(roomId));
        botTurnTimers.delete(roomId);
      }
      scheduleBotTurn(roomId, 1000);
    }
  }
}

function handleBotPendingParticipation(roomId, game) {
  const action = game.pendingAction;
  if (!action) return;

  // Bots auto-bid in auctions
  if (action.type === 'auction') {
    let changed = false;
    for (const p of game.getAlivePlayers()) {
      if (p.isBot && !action.bids.hasOwnProperty(p.id)) {
        const minPrice = action.minPrice || 0;
        action.bids[p.id] = (p.money >= minPrice) ? minPrice : 0;
        changed = true;
      }
    }
    if (changed) {
      // Check if all alive players have now bid
      const alivePlayers = game.getAlivePlayers();
      const allBid = alivePlayers.every(pl => action.bids.hasOwnProperty(pl.id));
      if (allBid) {
        let winnerId = null, maxBid = 0;
        for (const [pid, bid] of Object.entries(action.bids)) {
          if (bid > maxBid) { maxBid = bid; winnerId = pid; }
        }
        if (winnerId && maxBid >= action.minPrice) {
          const winner = game.getPlayer(winnerId);
          winner.money -= maxBid;
          game.businesses[action.businessId].owner = winnerId;
          game.businesses[action.businessId].influenceLevel = 1;
          winner.businesses.push(action.businessId);
          game.addLog(`${winner.name} виграв аукціон за ${action.businessName}: ${maxBid}$.`);
        } else {
          game.addLog(`Аукціон за ${action.businessName} не відбувся.`);
        }
        game.pendingAction = null;
        // Re-broadcast after resolving auction (use setTimeout to avoid recursion)
        setTimeout(() => broadcastState(roomId), 100);
      }
    }
  }

  // Bot auto-responds to attack reactions targeting them
  if (action.type === 'attack_reaction' && action.targetId) {
    const target = game.getPlayer(action.targetId);
    if (target && target.isBot) {
      setTimeout(() => {
        if (!game.pendingAction || game.pendingAction.type !== 'attack_reaction') return;
        if (action.canBuyOff && target.money >= (action.buyOffCost || 0)) {
          game.resolveAttackReaction(target.id, 'buyOff');
        } else if (action.canVest) {
          game.resolveAttackReaction(target.id, 'vest');
        } else if (action.canPolice) {
          game.resolveAttackReaction(target.id, 'police');
        } else {
          game.resolveAttackReaction(target.id, 'nothing');
        }
        // After resolving, check if a new pending action was created (e.g. choose_kill_helper)
        resolveBotFollowUpAction(roomId, game);
        broadcastState(roomId);
      }, 1500);
    }
  }

  // Bot auto-chooses helper to kill if bot is the attacker
  if (action.type === 'choose_kill_helper' && action.attackerId) {
    const attacker = game.getPlayer(action.attackerId);
    if (attacker && attacker.isBot) {
      setTimeout(() => {
        if (!game.pendingAction || game.pendingAction.type !== 'choose_kill_helper') return;
        const target = game.getPlayer(action.targetId);
        if (target && target.helpers.length > 0) {
          // Bot picks random helper to kill
          const idx = Math.floor(Math.random() * target.helpers.length);
          game.executeChooseKillHelper(action.attackerId, action.targetId, idx);
        } else {
          game.pendingAction = null;
        }
        broadcastState(roomId);
      }, 1000);
    }
  }
}

// Resolve any follow-up bot pending actions (e.g. choose_kill_helper after attack_reaction)
function resolveBotFollowUpAction(roomId, game) {
  const action = game.pendingAction;
  if (!action) return;

  if (action.type === 'choose_kill_helper' && action.attackerId) {
    const attacker = game.getPlayer(action.attackerId);
    if (attacker && attacker.isBot) {
      const target = game.getPlayer(action.targetId);
      if (target && target.helpers.length > 0) {
        const idx = Math.floor(Math.random() * target.helpers.length);
        game.executeChooseKillHelper(action.attackerId, action.targetId, idx);
      } else {
        game.pendingAction = null;
      }
    }
  }
}

// --- Socket.IO ---
io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  // CREATE ROOM
  socket.on('createRoom', ({ playerName }, cb) => {
    const roomId = generateRoomId();
    const game = new GameEngine(roomId);
    const player = game.addPlayer(socket.id, playerName);
    rooms.set(roomId, game);
    playerRooms.set(socket.id, roomId);
    socket.join(roomId);
    cb({ roomId, playerId: socket.id, player });
    broadcastState(roomId);
  });

  // JOIN ROOM
  socket.on('joinRoom', ({ roomId, playerName }, cb) => {
    const game = rooms.get(roomId);
    if (!game) return cb({ error: 'Кімнату не знайдено.' });
    if (game.phase !== 'waiting') return cb({ error: 'Гра вже розпочалась.' });
    if (game.players.length >= 8) return cb({ error: 'Кімната повна.' });

    const player = game.addPlayer(socket.id, playerName);
    if (!player) return cb({ error: 'Не вдалося приєднатися.' });

    playerRooms.set(socket.id, roomId);
    socket.join(roomId);
    cb({ roomId, playerId: socket.id, player });
    broadcastState(roomId);
    broadcastEvent(roomId, 'playerJoined', { name: playerName, count: game.players.length });
  });

  // START GAME
  socket.on('startGame', (data, cb) => {
    const roomId = playerRooms.get(socket.id);
    const game = rooms.get(roomId);
    if (!game) return cb({ error: 'Гра не знайдена.' });
    if (game.players[0].id !== socket.id) return cb({ error: 'Тільки хост може почати гру.' });

    // Apply game settings
    if (data && data.mafiaCardMinRound) {
      game.mafiaCardMinRound = Math.max(1, Math.min(10, parseInt(data.mafiaCardMinRound) || 3));
    }

    const success = game.startGame();
    if (!success) return cb({ error: 'Потрібно мінімум 2 гравці.' });

    cb({ success: true });
    broadcastState(roomId);
    broadcastEvent(roomId, 'gameStarted', {});

    // Auto-roll for bots in order phase
    scheduleOrderRolls(roomId);
  });

  // ROLL FOR ORDER (pre-game dice roll to determine turn order)
  socket.on('rollForOrder', (_, cb) => {
    const roomId = playerRooms.get(socket.id);
    const game = rooms.get(roomId);
    if (!game) return cb({ error: 'Гра не знайдена.' });
    if (game.phase !== 'rolling_order') return cb({ error: 'Не та фаза гри.' });

    const result = game.rollForOrder(socket.id);
    cb(result);
    broadcastState(roomId);

    // After human rolls, check if next player is bot
    if (!result.error) {
      scheduleOrderRolls(roomId);
    }
  });

  // ADD BOT
  socket.on('addBot', (_, cb) => {
    const roomId = playerRooms.get(socket.id);
    const game = rooms.get(roomId);
    if (!game) return cb({ error: 'Гра не знайдена.' });
    if (game.phase !== 'waiting') return cb({ error: 'Гра вже розпочалась.' });
    if (game.players[0].id !== socket.id) return cb({ error: 'Тільки хост може додавати ботів.' });
    if (game.players.length >= 8) return cb({ error: 'Кімната повна.' });

    const count = (botCounters.get(roomId) || 0) + 1;
    botCounters.set(roomId, count);
    const botId = `bot_${count}`;
    const botName = BOT_NAMES[(count - 1) % BOT_NAMES.length];

    const player = game.addPlayer(botId, botName, true);
    if (!player) return cb({ error: 'Не вдалося додати бота.' });

    cb({ success: true, botName });
    broadcastState(roomId);
    broadcastEvent(roomId, 'playerJoined', { name: botName, count: game.players.length });
  });

  // ROLL DICE
  socket.on('rollDice', (_, cb) => {
   try {
    const roomId = playerRooms.get(socket.id);
    const game = rooms.get(roomId);
    if (!game) return cb({ error: 'Гра не знайдена.' });

    const result = game.rollDiceForPlayer(socket.id);
    if (!result) return cb({ error: 'Не ваш хід або неправильна фаза.' });

    cb(result);
    broadcastState(roomId);

    // Auto-end turn if player is in prison (skip turn) or just released (skip this turn too)
    if (result && (result.inPrison || result.released)) {
      setTimeout(() => {
        try {
          game.endTurn(socket.id);
          broadcastState(roomId);
        } catch (err) {
          console.error('rollDice auto-endTurn error:', err.message, err.stack);
        }
      }, 1500); // Small delay so player sees the message
    }

    // If there's a pending attack reaction, notify target
    if (game.pendingAction && game.pendingAction.type === 'attack_reaction') {
      broadcastEvent(roomId, 'attackAlert', {
        attackerId: game.pendingAction.attackerId,
        targetId: game.pendingAction.targetId,
        card: game.pendingAction.card,
        canVest: game.pendingAction.canVest,
        canPolice: game.pendingAction.canPolice,
        canBuyOff: game.pendingAction.canBuyOff,
        buyOffCost: game.pendingAction.buyOffCost,
        timeLimit: game.pendingAction.timeLimit
      });
    }
   } catch (err) {
    console.error('rollDice error:', err.message, err.stack);
    cb({ error: 'Внутрішня помилка сервера.' });
   }
  });

  // RESOLVE PENDING ACTION (generic handler)
  socket.on('resolveAction', ({ actionType, data }, cb) => {
   try {
    const roomId = playerRooms.get(socket.id);
    const game = rooms.get(roomId);
    if (!game) return cb({ error: 'Гра не знайдена.' });

    let result;
    switch (actionType) {
      case 'buy_business':
        result = game.executeBuyBusiness(socket.id, data.businessId, data.buy);
        break;
      case 'pay_rent':
        result = game.executePayRent(socket.id, data.useRobbery);
        break;
      case 'seize_prison_business':
        result = game.executeSeizePrisonBusiness(socket.id, data.businessId, data.buy);
        break;
      case 'police_choice':
        result = game.resolvePoliceChoice(socket.id, data.choiceId);
        break;
      case 'start_bonus':
        result = game.resolveStartBonusChoice(socket.id, data.choiceId);
        break;
      case 'bar_choice':
        result = game.executeBarChoice(socket.id, data.choiceId);
        break;
      case 'hire_helper':
        result = game.hireHelper(socket.id);
        break;
      case 'choose_hidden_helper':
        result = game.executeChooseHiddenHelper(socket.id, data.cardIndex);
        break;
      case 'decline_hire':
        game.pendingAction = null;
        result = { success: true };
        break;
      case 'event_confirm':
        result = game.executeEventConfirm(socket.id);
        break;
      case 'mafia_confirm':
        result = game.executeMafiaConfirm(socket.id);
        break;
      case 'casino':
        result = game.playCasino(socket.id, data.betType, data.betAmount);
        break;
      case 'attack_reaction':
        result = game.resolveAttackReaction(socket.id, data.reaction);
        break;
      case 'choose_kill_helper':
        result = game.executeChooseKillHelper(data.attackerId, data.targetId, data.helperIndex);
        break;
      case 'choose_lose_helper':
        if (game.pendingAction && game.pendingAction.type === 'choose_lose_helper') {
          const player = game.getPlayer(socket.id);
          if (data.helperIndex >= 0 && data.helperIndex < player.helpers.length) {
            const helper = player.helpers.splice(data.helperIndex, 1)[0];
            game.returnHelperToDeck(helper);
            game.addLog(`${player.name} втратив помічника ${helper.name}.`);
            game.pendingAction = null;
            result = { success: true };
          }
        }
        break;
      case 'pay_or_prison':
        if (game.pendingAction && game.pendingAction.type === 'pay_or_prison') {
          const player = game.getPlayer(socket.id);
          if (data.pay && player.money >= game.pendingAction.amount) {
            player.money -= game.pendingAction.amount;
            game.pendingAction = null;
            result = { paid: true };
          } else {
            game.sendToPrison(player, 2);
            game.pendingAction = null;
            result = { prison: true };
          }
        }
        break;
      case 'discard_mafia':
        if (game.pendingAction && game.pendingAction.type === 'discard_mafia_cards') {
          const player = game.getPlayer(socket.id);
          const indices = data.cardIndices || [];
          const removed = [];
          // Remove from highest index first
          indices.sort((a, b) => b - a);
          for (const idx of indices) {
            if (idx >= 0 && idx < player.mafiaCards.length) {
              removed.push(...player.mafiaCards.splice(idx, 1));
            }
          }
          game.mafiaDiscard.push(...removed);
          game.pendingAction = null;
          result = { discarded: removed.length };
        }
        break;
      case 'bomb_choose_helper':
        if (game.pendingAction && game.pendingAction.type === 'bomb_choose_helper') {
          const player = game.getPlayer(socket.id);
          if (data.helperIndex >= 0 && data.helperIndex < player.helpers.length) {
            const helper = player.helpers.splice(data.helperIndex, 1)[0];
            game.returnHelperToDeck(helper);
            game.addLog(`${helper.name} загинув від вибуху бомби!`);
            game.pendingAction = null;
            result = { success: true };
            // After bomb damage is resolved, continue with deferred landing if any
            const deferredResult = game.resolveDeferredLanding(socket.id);
            if (deferredResult) {
              result.deferredLanding = deferredResult;
            }
          }
        }
        break;
      case 'police_bonus':
        if (game.pendingAction && game.pendingAction.type === 'police_bonus_choice') {
          game.pendingAction = null;
          const player = game.getPlayer(socket.id);
          if (data.choiceId === 'spy') {
            // Will need target selection
            result = { type: 'spy_choose_target' };
          } else if (data.choiceId === 'defuse') {
            if (game.bombs.length > 0) {
              game.bombs.pop();
              game.addLog(`${player.name} знешкодив бомбу!`);
            }
            result = { success: true };
          } else if (data.choiceId === 'protection') {
            player.policeProtection = true;
            game.addLog(`${player.name} під захистом поліції до наступного ходу.`);
            result = { success: true };
          }
        }
        break;
      case 'upgrade_influence':
        if (game.pendingAction && game.pendingAction.type === 'upgrade_influence_on_own') {
          if (data.upgrade) {
            const bizId = game.pendingAction.businessId;
            result = game.buyInfluence(socket.id, bizId);
          } else {
            result = { success: true };
          }
          game.pendingAction = null;
        }
        break;
      case 'choose_influence_business':
        if (game.pendingAction && game.pendingAction.type === 'choose_influence_business') {
          if (data.businessId) {
            const bizState = game.businesses[data.businessId];
            if (bizState) {
              bizState.influenceLevel = (bizState.influenceLevel || 0) + 1;
              const bizData = game.getBusiness(data.businessId);
              game.addLog(`${game.getPlayer(socket.id).name} додав вплив на ${bizData ? bizData.name : data.businessId}.`);
              game.pendingAction = null;
              result = { success: true };
            }
          }
        }
        break;
      case 'jackpot_choose_business':
        if (game.pendingAction && game.pendingAction.type === 'jackpot_choose_business') {
          const player = game.getPlayer(socket.id);
          const bizState = game.businesses[data.businessId];
          if (!bizState) { result = { error: 'Бізнес не знайдено.' }; break; }
          const prevOwner = bizState.owner ? game.getPlayer(bizState.owner) : null;
          if (prevOwner) {
            prevOwner.businesses = prevOwner.businesses.filter(b => b !== data.businessId);
          }
          bizState.owner = player.id;
          if (!player.businesses.includes(data.businessId)) player.businesses.push(data.businessId);
          const bizData = game.getBusiness(data.businessId);
          game.addLog(`${player.name} забрав ${bizData ? bizData.name : data.businessId} через MAFIA JACKPOT!`);
          game.pendingAction = null;
          result = { success: true };
        }
        break;
      case 'extra_step_choice':
        result = game.resolveExtraStepChoice(socket.id, data.useStep);
        break;
      case 'buyout_business':
        result = game.buyBusinessByInfluence(socket.id, data.businessId);
        if (result.success) game.pendingAction = null;
        break;
      default:
        result = { error: 'Невідома дія.' };
    }

    if (!result) result = { error: 'Не вдалося виконати дію.' };
    cb(result);

    // After action resolved, check if BAR pass-through hire is pending
    if (!game.pendingAction && game._barHirePending) {
      const barPlayer = game.getPlayer(game._barHirePending);
      if (barPlayer) {
        game._offerBarHire(barPlayer);
      }
      game._barHirePending = null;
    }

    broadcastState(roomId);

    // Check for attack alerts
    if (game.pendingAction && game.pendingAction.type === 'attack_reaction') {
      broadcastEvent(roomId, 'attackAlert', game.pendingAction);
    }
   } catch (err) {
    console.error('resolveAction error:', err.message, err.stack);
    cb({ error: 'Внутрішня помилка сервера.' });
   }
  });

  // PLAY MAFIA CARD
  socket.on('playMafiaCard', ({ cardId, targetId, options }, cb) => {
   try {
    const roomId = playerRooms.get(socket.id);
    const game = rooms.get(roomId);
    if (!game) return cb({ error: 'Гра не знайдена.' });

    const result = game.playMafiaCard(socket.id, cardId, targetId, options);
    cb(result);
    broadcastState(roomId);

    if (game.pendingAction && game.pendingAction.type === 'attack_reaction') {
      broadcastEvent(roomId, 'attackAlert', {
        attackerId: game.pendingAction.attackerId,
        targetId: game.pendingAction.targetId,
        card: game.pendingAction.card,
        canVest: game.pendingAction.canVest,
        canPolice: game.pendingAction.canPolice,
        canBuyOff: game.pendingAction.canBuyOff,
        buyOffCost: game.pendingAction.buyOffCost,
        timeLimit: game.pendingAction.timeLimit
      });
    }
   } catch (err) {
    console.error('playMafiaCard error:', err.message, err.stack);
    cb({ error: 'Внутрішня помилка сервера.' });
   }
  });

  // USE MAD DOG
  socket.on('useMadDog', ({ targetId }, cb) => {
    const roomId = playerRooms.get(socket.id);
    const game = rooms.get(roomId);
    if (!game) return cb({ error: 'Гра не знайдена.' });
    const result = game.useMadDogAmbush(socket.id, targetId);
    cb(result);
    broadcastState(roomId);
  });

  // BUY INFLUENCE (per-business)
  socket.on('buyInfluence', ({ businessId }, cb) => {
    const roomId = playerRooms.get(socket.id);
    const game = rooms.get(roomId);
    if (!game) return cb({ error: 'Гра не знайдена.' });
    const result = game.buyInfluence(socket.id, businessId);
    cb(result);
    broadcastState(roomId);
  });

  // BUY BUSINESS BY INFLUENCE
  socket.on('buyBusinessByInfluence', ({ businessId }, cb) => {
    const roomId = playerRooms.get(socket.id);
    const game = rooms.get(roomId);
    if (!game) return cb({ error: 'Гра не знайдена.' });
    const result = game.buyBusinessByInfluence(socket.id, businessId);
    cb(result);
    broadcastState(roomId);
  });

  // USE HELPER ABILITY
  socket.on('useHelperAbility', ({ ability, data: abilityData }, cb) => {
    const roomId = playerRooms.get(socket.id);
    const game = rooms.get(roomId);
    if (!game) return cb({ error: 'Гра не знайдена.' });
    const result = game.useHelperAbility(socket.id, ability, abilityData || {});
    cb(result);
    broadcastState(roomId);
  });

  // UPGRADE RESPECT
  socket.on('upgradeRespect', (_, cb) => {
    const roomId = playerRooms.get(socket.id);
    const game = rooms.get(roomId);
    if (!game) return cb({ error: 'Гра не знайдена.' });
    const result = game.upgradeRespect(socket.id);
    cb(result);
    broadcastState(roomId);
  });

  // EXTRA STEP (Cappo Corrado) — now handled via pending action flow (extra_step_choice)
  // Keep handler as fallback that returns an error
  socket.on('extraStep', (_, cb) => {
    cb({ error: 'Крок Коррадо тепер обирається автоматично після кидка кубиків.' });
  });

  // END TURN
  socket.on('endTurn', (_, cb) => {
   try {
    const roomId = playerRooms.get(socket.id);
    const game = rooms.get(roomId);
    if (!game) return cb({ error: 'Гра не знайдена.' });

    // Clear police protection
    const player = game.getPlayer(socket.id);
    if (player) player.policeProtection = false;

    const result = game.endTurn(socket.id);
    cb(result);
    broadcastState(roomId);
   } catch (err) {
    console.error('endTurn error:', err.message, err.stack);
    cb({ error: 'Внутрішня помилка сервера.' });
   }
  });

  // AUCTION BID
  socket.on('auctionBid', ({ amount }, cb) => {
    const roomId = playerRooms.get(socket.id);
    const game = rooms.get(roomId);
    if (!game || !game.pendingAction || game.pendingAction.type !== 'auction') {
      return cb({ error: 'Немає аукціону.' });
    }
    const player = game.getPlayer(socket.id);
    if (!player.alive) return cb({ error: 'Ви вибули з гри.' });
    if (amount > 0 && amount > player.money) return cb({ error: 'Недостатньо коштів.' });
    game.pendingAction.bids[socket.id] = amount;
    cb({ success: true, bid: amount });
    broadcastEvent(roomId, 'auctionBid', { playerId: socket.id, playerName: player.name, amount });

    // Auto-resolve when all alive players have bid
    const alivePlayers = game.getAlivePlayers();
    const allBid = alivePlayers.every(p => game.pendingAction.bids.hasOwnProperty(p.id));
    if (allBid) {
      const action = game.pendingAction;
      let winnerId = null, maxBid = 0;
      for (const [pid, bid] of Object.entries(action.bids)) {
        if (bid > maxBid) { maxBid = bid; winnerId = pid; }
      }

      if (winnerId && maxBid >= action.minPrice) {
        const winner = game.getPlayer(winnerId);
        winner.money -= maxBid;
        game.businesses[action.businessId].owner = winnerId;
        game.businesses[action.businessId].influenceLevel = 1;
        winner.businesses.push(action.businessId);
        game.addLog(`${winner.name} виграв аукціон за ${action.businessName}: ${maxBid}$.`);
      } else {
        game.addLog(`Аукціон за ${action.businessName} не відбувся.`);
      }
      game.pendingAction = null;
      broadcastState(roomId);
    }
  });

  // SURRENDER
  socket.on('surrender', (data, cb) => {
    const roomId = playerRooms.get(socket.id);
    const game = rooms.get(roomId);
    if (!game) return cb({ error: 'Гра не знайдена.' });
    const result = game.surrender(socket.id);
    cb(result);
    broadcastState(roomId);
  });

  // ===== CHEAT/DEBUG HANDLERS =====
  socket.on('cheat_addCard', (data, cb) => {
    try {
      const roomId = playerRooms.get(socket.id);
      const game = rooms.get(roomId);
      if (!game) return cb({ error: 'No game' });
      const player = game.getPlayer(socket.id);
      if (!player) return cb({ error: 'No player' });

      const { MAFIA_CARDS } = require('./game/data');
      const card = MAFIA_CARDS.find(c => c.id === data.cardId);
      if (!card) return cb({ error: 'Card not found: ' + data.cardId });

      player.mafiaCards.push({...card});
      game.addLog(`[CHEAT] ${player.name} отримав карту: ${card.name}`);
      cb({ success: true });
      broadcastState(roomId);
    } catch(e) { cb({ error: e.message }); }
  });

  socket.on('cheat_addHelper', (data, cb) => {
    try {
      const roomId = playerRooms.get(socket.id);
      const game = rooms.get(roomId);
      if (!game) return cb({ error: 'No game' });
      const player = game.getPlayer(socket.id);
      if (!player) return cb({ error: 'No player' });

      const { HELPERS } = require('./game/data');
      const helper = HELPERS.find(h => h.id === data.helperId);
      if (!helper) return cb({ error: 'Helper not found: ' + data.helperId });

      player.helpers.push({...helper});
      game.addLog(`[CHEAT] ${player.name} найняв: ${helper.name}`);
      cb({ success: true });
      broadcastState(roomId);
    } catch(e) { cb({ error: e.message }); }
  });

  socket.on('cheat_setMoney', (data, cb) => {
    try {
      const roomId = playerRooms.get(socket.id);
      const game = rooms.get(roomId);
      if (!game) return cb({ error: 'No game' });
      const player = game.getPlayer(socket.id);
      if (!player) return cb({ error: 'No player' });
      player.money = data.amount || 50000;
      if (data.setMinRound !== undefined) game.mafiaCardMinRound = data.setMinRound;
      cb({ success: true });
      broadcastState(roomId);
    } catch(e) { cb({ error: e.message }); }
  });

  socket.on('cheat_teleport', (data, cb) => {
    try {
      const roomId = playerRooms.get(socket.id);
      const game = rooms.get(roomId);
      if (!game) return cb({ error: 'No game' });
      const player = game.getPlayer(socket.id);
      if (!player) return cb({ error: 'No player' });
      player.position = data.sector || 0;
      cb({ success: true });
      broadcastState(roomId);
    } catch(e) { cb({ error: e.message }); }
  });

  socket.on('cheat_addHelperToPlayer', (data, cb) => {
    try {
      const roomId = playerRooms.get(socket.id);
      const game = rooms.get(roomId);
      if (!game) return cb({ error: 'No game' });
      const target = game.getPlayer(data.playerId);
      if (!target) return cb({ error: 'Player not found' });
      const { HELPERS } = require('./game/data');
      const helper = HELPERS.find(h => h.id === data.helperId);
      if (!helper) return cb({ error: 'Helper not found' });
      target.helpers.push({...helper});
      game.addLog(`[CHEAT] ${target.name} найняв: ${helper.name}`);
      cb({ success: true });
      broadcastState(roomId);
    } catch(e) { cb({ error: e.message }); }
  });

  socket.on('cheat_placeBomb', (data, cb) => {
    try {
      const roomId = playerRooms.get(socket.id);
      const game = rooms.get(roomId);
      if (!game) return cb({ error: 'No game' });
      game.bombs.push({ sector: data.sector || 5, placedBy: socket.id });
      cb({ success: true });
      broadcastState(roomId);
    } catch(e) { cb({ error: e.message }); }
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    const roomId = playerRooms.get(socket.id);
    if (roomId) {
      const game = rooms.get(roomId);
      if (game) {
        const player = game.getPlayer(socket.id);
        if (player) {
          player.alive = false;
          game.addLog(`${player.name} від'єднався.`);
          // Check win
          const alive = game.getAlivePlayers();
          if (alive.length === 1 && game.phase === 'playing') {
            game.phase = 'finished';
            game.winner = alive[0];
            game.addLog(`${alive[0].name} переміг!`);
          }
          if (alive.length === 0) {
            rooms.delete(roomId);
          }
        }
        broadcastState(roomId);
      }
      playerRooms.delete(socket.id);
    }
    console.log(`Disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Mafia Business v2 running on http://localhost:${PORT}`);
});
