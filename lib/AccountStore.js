const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ALLOWED_LANGUAGES = new Set(['uk', 'ru', 'en']);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeUsername(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function usernameKey(value) {
  return normalizeUsername(value).toLocaleLowerCase('en-US');
}

function validateRegistration({ username, email, password }) {
  const cleanUsername = normalizeUsername(username);
  const cleanEmail = normalizeEmail(email);

  if (cleanUsername.length < 3 || cleanUsername.length > 20) {
    return 'Имя должно содержать от 3 до 20 символов.';
  }
  if (!/^[\p{L}\p{N}_ -]+$/u.test(cleanUsername)) {
    return 'В имени разрешены буквы, цифры, пробел, дефис и подчёркивание.';
  }
  if (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return 'Введите корректный email.';
  }
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
    return 'Пароль должен содержать от 10 до 128 символов.';
  }
  return null;
}

class AccountStore {
  constructor({ filePath, sessionTtlMs = SESSION_TTL_MS } = {}) {
    this.filePath = filePath || path.join(process.cwd(), 'data', 'accounts.json');
    this.sessionTtlMs = sessionTtlMs;
    this.accounts = [];
    this.sessions = new Map();
    this.pendingUsernames = new Set();
    this.pendingEmails = new Set();
    this._load();
  }

  _load() {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      this.accounts = Array.isArray(parsed.accounts) ? parsed.accounts : [];
    } catch (error) {
      throw new Error(`Cannot read account database: ${error.message}`);
    }
  }

  _save() {
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify({ version: 1, accounts: this.accounts }, null, 2), {
      encoding: 'utf8',
      mode: 0o600
    });
    fs.renameSync(tempPath, this.filePath);
  }

  async _hashPassword(password, salt = crypto.randomBytes(16)) {
    const derivedKey = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
    return {
      salt: Buffer.from(salt).toString('base64'),
      passwordHash: Buffer.from(derivedKey).toString('base64')
    };
  }

  async _passwordMatches(password, account) {
    const salt = Buffer.from(account.salt, 'base64');
    const candidate = await this._hashPassword(password, salt);
    const expected = Buffer.from(account.passwordHash, 'base64');
    const actual = Buffer.from(candidate.passwordHash, 'base64');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  async createAccount(input) {
    const error = validateRegistration(input || {});
    if (error) return { error };

    const username = normalizeUsername(input.username);
    const email = normalizeEmail(input.email);
    const cleanUsernameKey = usernameKey(username);
    if (this.pendingUsernames.has(cleanUsernameKey) || this.accounts.some(account => account.usernameKey === cleanUsernameKey)) {
      return { error: 'Это имя уже занято.' };
    }
    if (this.pendingEmails.has(email) || this.accounts.some(account => account.emailKey === email)) {
      return { error: 'Аккаунт с таким email уже существует.' };
    }

    this.pendingUsernames.add(cleanUsernameKey);
    this.pendingEmails.add(email);
    try {
      const credentials = await this._hashPassword(input.password);
      const now = new Date().toISOString();
      const account = {
        id: crypto.randomUUID(),
        username,
        usernameKey: cleanUsernameKey,
        email,
        emailKey: email,
        ...credentials,
        createdAt: now,
        lastLoginAt: now,
        preferences: { language: 'uk' }
      };
      this.accounts.push(account);
      this._save();
      return { account: this.toPublic(account), sessionToken: this.createSession(account.id) };
    } finally {
      this.pendingUsernames.delete(cleanUsernameKey);
      this.pendingEmails.delete(email);
    }
  }

  async login({ identity, password } = {}) {
    const key = String(identity || '').trim().toLowerCase();
    const account = this.accounts.find(item => item.emailKey === key || item.usernameKey === key);

    // Do equivalent expensive work even when the account does not exist.
    if (!account) {
      await this._hashPassword(String(password || ''), Buffer.alloc(16, 7));
      return { error: 'Неверное имя, email или пароль.' };
    }
    if (typeof password !== 'string' || !(await this._passwordMatches(password, account))) {
      return { error: 'Неверное имя, email или пароль.' };
    }

    account.lastLoginAt = new Date().toISOString();
    this._save();
    return { account: this.toPublic(account), sessionToken: this.createSession(account.id) };
  }

  createSession(accountId) {
    const now = Date.now();
    for (const [key, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(key);
    }
    const accountSessions = [...this.sessions.entries()].filter(([, session]) => session.accountId === accountId);
    for (const [key] of accountSessions.slice(0, Math.max(0, accountSessions.length - 4))) {
      this.sessions.delete(key);
    }
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = this._tokenHash(token);
    this.sessions.set(tokenHash, { accountId, expiresAt: now + this.sessionTtlMs });
    return token;
  }

  destroySession(token) {
    if (token) this.sessions.delete(this._tokenHash(token));
  }

  getAccountBySession(token) {
    if (!token) return null;
    const key = this._tokenHash(token);
    const session = this.sessions.get(key);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(key);
      return null;
    }
    const account = this.accounts.find(item => item.id === session.accountId);
    return account ? this.toPublic(account) : null;
  }

  updatePreferences(accountId, preferences = {}) {
    const account = this.accounts.find(item => item.id === accountId);
    if (!account) return null;
    if (ALLOWED_LANGUAGES.has(preferences.language)) {
      account.preferences = { ...(account.preferences || {}), language: preferences.language };
      this._save();
    }
    return this.toPublic(account);
  }

  toPublic(account) {
    return {
      id: account.id,
      username: account.username,
      email: account.email,
      createdAt: account.createdAt,
      preferences: { language: account.preferences?.language || 'uk' }
    };
  }

  _tokenHash(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
  }
}

module.exports = { AccountStore, normalizeEmail, normalizeUsername, validateRegistration };
