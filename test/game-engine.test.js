const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../game/GameEngine');
const { HELPERS, MAFIA_CARDS } = require('../game/data');

function createPlayingGame() {
  const game = new GameEngine('TEST');
  game.addPlayer('p1', 'Alice');
  game.addPlayer('p2', 'Bob');
  game.startGame();
  game.phase = 'playing';
  game.turnPhase = 'action';
  game.currentPlayerIndex = 0;
  game.mafiaCardMinRound = 1;
  return game;
}

test('robbery is not consumed when played outside rent flow', () => {
  const game = createPlayingGame();
  const player = game.getPlayer('p1');
  player.mafiaCards.push({ id: 'robbery', name: 'Пограбування', type: 'economic' });

  const result = game.playMafiaCard('p1', 'robbery');

  assert.equal(result.error, 'Пограбування використовується під час оплати.');
  assert.deepEqual(player.mafiaCards.map(c => c.id), ['robbery']);
  assert.equal(game.mafiaDiscard.length, 0);
});

test('buying a business requires an active buy_business pending action', () => {
  const game = createPlayingGame();

  const result = game.executeBuyBusiness('p1', 'kiosk', true);

  assert.equal(result.error, 'Немає дії.');
  assert.equal(game.businesses.kiosk.owner, null);
  assert.equal(game.getPlayer('p1').money, 20000);
});

test('car bomb kills up to two helpers before it can kill the boss', () => {
  const game = createPlayingGame();
  const attacker = game.getPlayer('p1');
  const target = game.getPlayer('p2');

  attacker.money = 10000;
  attacker.mafiaCards.push({
    id: 'car_bomb',
    name: 'Автомобільна бомба',
    type: 'attack',
    cost: 2500,
    range: Infinity,
    killsHelper: true,
    canDodge: true,
    canBuyOff: true,
    canPolice: true
  });
  target.helpers.push(HELPERS[0], HELPERS[1]);

  const playResult = game.playMafiaCard('p1', 'car_bomb', 'p2');
  const reactionResult = game.resolveAttackReaction('p2', 'nothing');

  assert.equal(playResult.type, 'attack_initiated');
  assert.equal(reactionResult.type, 'car_bomb_result');
  assert.equal(reactionResult.bossKilled, false);
  assert.equal(reactionResult.helpersKilled, 2);
  assert.equal(target.alive, true);
  assert.equal(target.helpers.length, 0);
});

test('car bomb kills the boss only when the target has no helpers', () => {
  const game = createPlayingGame();
  const attacker = game.getPlayer('p1');
  const target = game.getPlayer('p2');

  attacker.money = 10000;
  attacker.mafiaCards.push({
    id: 'car_bomb',
    name: 'Автомобільна бомба',
    type: 'attack',
    cost: 2500,
    range: Infinity,
    killsHelper: true,
    canDodge: true,
    canBuyOff: true,
    canPolice: true
  });

  const playResult = game.playMafiaCard('p1', 'car_bomb', 'p2');
  const reactionResult = game.resolveAttackReaction('p2', 'nothing');

  assert.equal(playResult.type, 'attack_initiated');
  assert.equal(reactionResult.type, 'car_bomb_result');
  assert.equal(reactionResult.bossKilled, true);
  assert.equal(target.alive, false);
});

test('diplomat cancels an active attack reaction against the player', () => {
  const game = createPlayingGame();
  const attacker = game.getPlayer('p1');
  const target = game.getPlayer('p2');

  target.helpers.push(HELPERS.find(h => h.ability === 'diplomat'));
  attacker.mafiaCards.push({ ...MAFIA_CARDS.find(c => c.id === 'sniper') });

  const playResult = game.playMafiaCard('p1', 'sniper', 'p2');
  const helperResult = game.useHelperAbility('p2', 'diplomat', {});

  assert.equal(playResult.type, 'attack_initiated');
  assert.equal(helperResult.type, 'diplomat_used');
  assert.equal(game.pendingAction, null);
  assert.equal(target._tommyUsed, true);
});

test('pass-through bomb with helpers stops movement and waits for helper choice', () => {
  const game = createPlayingGame();
  const player = game.getPlayer('p1');

  game.turnPhase = 'roll';
  game.currentPlayerIndex = 0;
  player.position = 0;
  player.helpers.push(HELPERS[0], HELPERS[1]);
  game.bombs.push({ sector: 1, placedBy: 'p2' });

  const moveResult = game.movePlayer(player, 4);

  assert.equal(moveResult.bombExploded, true);
  assert.equal(moveResult.bombPendingChoice, true);
  assert.equal(moveResult.newPos, 1);
  assert.equal(player.position, 1);
  assert.equal(game.pendingAction?.type, 'bomb_choose_helper');
  assert.equal(game.pendingAction?.playerId, 'p1');
});

test('casino can be skipped without throwing an invalid bet error', () => {
  const game = createPlayingGame();
  game.pendingAction = { type: 'casino', playerId: 'p1', phase: 'betting' };

  const result = game.playCasino('p1', 'skip');

  assert.equal(result.type, 'casino_skipped');
  assert.equal(game.pendingAction, null);
});

test('lawyer can still be used during prison roll phase', () => {
  const game = createPlayingGame();
  const player = game.getPlayer('p1');

  game.turnPhase = 'roll';
  player.inPrison = 2;
  player.mafiaCards.push({ id: 'lawyer', name: 'Адвокат', type: 'utility' });

  const result = game.playMafiaCard('p1', 'lawyer');

  assert.equal(result.type, 'lawyer_used');
  assert.equal(player.inPrison, 0);
  assert.equal(player.mafiaCards.length, 0);
});

test('robbery can be blocked by police during rent payment', () => {
  const game = createPlayingGame();
  const player = game.getPlayer('p1');
  const owner = game.getPlayer('p2');

  player.mafiaCards.push({ ...MAFIA_CARDS.find(c => c.id === 'robbery') });
  owner.mafiaCards.push({ id: 'police_card', name: 'Поліція', type: 'defense' });
  game.pendingAction = {
    type: 'pay_rent',
    playerId: 'p1',
    ownerId: 'p2',
    ownerName: owner.name,
    amount: 800,
    businessId: 'kiosk',
    businessName: 'Кіоск'
  };

  const payResult = game.executePayRent('p1', true);
  const reactionResult = game.resolveAttackReaction('p2', 'police');

  assert.equal(payResult.pendingReaction, true);
  assert.equal(game.getPlayer('p1').inPrison, 2);
  assert.equal(reactionResult.type, 'attack_blocked');
  assert.equal(player.money, 20000);
  assert.equal(owner.money, 20000);
});

test('hostile takeover waits for police reaction and resolves on no reaction', () => {
  const game = createPlayingGame();
  const attacker = game.getPlayer('p1');
  const owner = game.getPlayer('p2');

  attacker.mafiaCards.push({ ...MAFIA_CARDS.find(c => c.id === 'hostile_takeover') });
  attacker.money = 20000;
  owner.mafiaCards.push({ id: 'police_card', name: 'Поліція', type: 'defense' });
  owner.businesses.push('kiosk');
  game.businesses.kiosk.owner = 'p2';
  game.businesses.kiosk.influenceLevel = 2;

  const playResult = game.playMafiaCard('p1', 'hostile_takeover', null, { businessId: 'kiosk' });
  const reactionResult = game.resolveAttackReaction('p2', 'nothing');

  assert.equal(playResult.pendingReaction, true);
  assert.equal(reactionResult.type, 'hostile_takeover_done');
  assert.equal(game.businesses.kiosk.owner, 'p1');
  assert.ok(attacker.businesses.includes('kiosk'));
  assert.ok(!owner.businesses.includes('kiosk'));
});

test('private pending actions are sanitized for uninvolved viewers', () => {
  const game = new GameEngine('TEST');
  game.addPlayer('p1', 'Alice');
  game.addPlayer('p2', 'Bob');
  game.addPlayer('p3', 'Charlie');

  game.pendingAction = {
    type: 'trade_offer',
    fromId: 'p1',
    toId: 'p2',
    fromName: 'Alice',
    toName: 'Bob',
    offer: {
      giveMoney: 1000,
      wantMoney: 0,
      giveBusiness: ['kiosk'],
      wantBusiness: []
    },
    playerId: 'p2'
  };

  const responderState = game.getState('p2');
  const bystanderState = game.getState('p3');
  const tvState = game.getState(null);

  assert.deepEqual(responderState.pendingAction.offer, {
    giveMoney: 1000,
    wantMoney: 0,
    giveBusiness: ['kiosk'],
    wantBusiness: []
  });
  assert.equal('offer' in bystanderState.pendingAction, false);
  assert.equal('offer' in tvState.pendingAction, false);

  game.pendingAction = {
    type: 'choose_own_helper_to_release',
    playerId: 'p1',
    targetId: 'p2',
    targetHelperCount: 2,
    ownHelpers: [
      { id: 'h1', name: 'Helper One', ability: 'foo' },
      { id: 'h2', name: 'Helper Two', ability: 'bar' }
    ]
  };

  const ownerState = game.getState('p1');
  const otherState = game.getState('p2');

  assert.equal(Array.isArray(ownerState.pendingAction.ownHelpers), true);
  assert.equal('ownHelpers' in otherState.pendingAction, false);
  assert.equal(otherState.pendingAction.targetHelperCount, 2);
});

test('victory score includes cash, business value, and influence investments', () => {
  const game = createPlayingGame();
  const p1 = game.getPlayer('p1');
  const p2 = game.getPlayer('p2');

  p1.money = 4000;
  p1.businesses.push('kiosk');
  game.businesses.kiosk.owner = 'p1';
  game.businesses.kiosk.influenceLevel = 4;

  p2.money = 5200;
  p2.businesses.push('avto_moyka');
  game.businesses.avto_moyka.owner = 'p2';
  game.businesses.avto_moyka.influenceLevel = 1;

  const p1Score = game.getPlayerVictoryBreakdown(p1);
  const p2Score = game.getPlayerVictoryBreakdown(p2);

  assert.equal(p1Score.businessValue, 900);
  assert.equal(p1Score.influenceValue, 1200);
  assert.equal(p1Score.total, 6100);
  assert.equal(p2Score.total, 6800);
  assert.equal(game.getPlayerVictoryScore('p2') > game.getPlayerVictoryScore('p1'), true);
});

test('tax collector is not consumed when nobody has money to pay tribute', () => {
  const game = createPlayingGame();
  const player = game.getPlayer('p1');
  const target = game.getPlayer('p2');

  player.mafiaCards.push({ ...MAFIA_CARDS.find(c => c.id === 'tax_collector') });
  target.money = 0;

  const result = game.playMafiaCard('p1', 'tax_collector');

  assert.equal(result.error, 'Ні в кого немає грошей для данини.');
  assert.equal(player.mafiaCards.length, 1);
  assert.equal(game.mafiaDiscard.length, 0);
});

test('blackmail is not consumed when target has no money', () => {
  const game = createPlayingGame();
  const player = game.getPlayer('p1');
  const target = game.getPlayer('p2');

  player.mafiaCards.push({ ...MAFIA_CARDS.find(c => c.id === 'blackmail') });
  target.money = 0;

  const result = game.playMafiaCard('p1', 'blackmail', 'p2');

  assert.equal(result.error, 'У цілі немає грошей для шантажу.');
  assert.equal(player.mafiaCards.length, 1);
  assert.equal(game.mafiaDiscard.length, 0);
});
