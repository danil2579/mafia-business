const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { AccountStore } = require('../lib/AccountStore');

function createStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mafia-business-auth-'));
  const filePath = path.join(directory, 'accounts.json');
  return { directory, filePath, store: new AccountStore({ filePath, sessionTtlMs: 1000 }) };
}

test('account registration hashes passwords and persists only credentials', async t => {
  const { directory, filePath, store } = createStore();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const result = await store.createAccount({
    username: 'Don Corleone',
    email: 'Don@example.com',
    password: 'correct horse battery staple'
  });
  const stored = JSON.parse(fs.readFileSync(filePath, 'utf8')).accounts[0];

  assert.equal(result.account.username, 'Don Corleone');
  assert.equal(result.account.email, 'don@example.com');
  assert.ok(result.sessionToken.length >= 40);
  assert.equal('password' in stored, false);
  assert.ok(stored.passwordHash.length > 40);
  assert.ok(stored.salt.length > 10);
});

test('login accepts username or email and rejects a wrong password', async t => {
  const { directory, store } = createStore();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  await store.createAccount({ username: 'Vinnie', email: 'vinnie@example.com', password: 'long secure password' });

  const byName = await store.login({ identity: 'vinnie', password: 'long secure password' });
  const byEmail = await store.login({ identity: 'VINNIE@EXAMPLE.COM', password: 'long secure password' });
  const rejected = await store.login({ identity: 'vinnie', password: 'incorrect password' });

  assert.equal(byName.account.username, 'Vinnie');
  assert.equal(byEmail.account.username, 'Vinnie');
  assert.equal(rejected.error, 'Неверное имя, email или пароль.');
});

test('duplicate accounts and invalid registrations are rejected', async t => {
  const { directory, store } = createStore();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  await store.createAccount({ username: 'Frankie', email: 'frankie@example.com', password: 'long secure password' });

  const duplicateName = await store.createAccount({ username: 'FRANKIE', email: 'other@example.com', password: 'long secure password' });
  const duplicateEmail = await store.createAccount({ username: 'Another', email: 'FRANKIE@example.com', password: 'long secure password' });
  const weak = await store.createAccount({ username: 'Ok Name', email: 'ok@example.com', password: 'short' });

  assert.equal(duplicateName.error, 'Это имя уже занято.');
  assert.equal(duplicateEmail.error, 'Аккаунт с таким email уже существует.');
  assert.equal(weak.error, 'Пароль должен содержать от 10 до 128 символов.');
});

test('sessions can be resolved and revoked without storing raw tokens', async t => {
  const { directory, store } = createStore();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const result = await store.createAccount({ username: 'Tommy', email: 'tommy@example.com', password: 'long secure password' });

  assert.equal(store.getAccountBySession(result.sessionToken).username, 'Tommy');
  assert.equal(store.sessions.has(result.sessionToken), false);
  store.destroySession(result.sessionToken);
  assert.equal(store.getAccountBySession(result.sessionToken), null);
});

test('concurrent registration cannot create duplicate identities', async t => {
  const { directory, store } = createStore();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const [first, second] = await Promise.all([
    store.createAccount({ username: 'Concurrent', email: 'one@example.com', password: 'long secure password' }),
    store.createAccount({ username: 'CONCURRENT', email: 'two@example.com', password: 'long secure password' })
  ]);

  assert.equal([first, second].filter(result => result.account).length, 1);
  assert.equal([first, second].filter(result => result.error === 'Это имя уже занято.').length, 1);
  assert.equal(store.accounts.length, 1);
});
