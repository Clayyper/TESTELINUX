const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const DATA_DIR = process.env.DATA_DIR || path.join(os.tmpdir(), 'rescisao-trct-auth');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

async function seedDefaultUsers() {
  const adminPasswordHash = await bcrypt.hash(process.env.ADMIN_DEFAULT_PASSWORD || '123456', 10);
  return {
    users: [
      {
        username: process.env.ADMIN_DEFAULT_USERNAME || 'admin',
        passwordHash: adminPasswordHash,
        role: 'admin',
        systems: ['portal', 'rescisao', 'auditoria'],
        createdAt: nowIso(),
        expiresAt: null,
        createdBy: 'system',
        active: true
      }
    ]
  };
}

async function ensureStore() {
  ensureDir();
  if (!fs.existsSync(USERS_FILE)) {
    const seeded = await seedDefaultUsers();
    fs.writeFileSync(USERS_FILE, JSON.stringify(seeded, null, 2), 'utf8');
  }
}

async function readStore() {
  await ensureStore();
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.users)) throw new Error('invalid users store');
    return parsed;
  } catch (_error) {
    const seeded = await seedDefaultUsers();
    fs.writeFileSync(USERS_FILE, JSON.stringify(seeded, null, 2), 'utf8');
    return seeded;
  }
}

async function writeStore(store) {
  await ensureStore();
  fs.writeFileSync(USERS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function isExpired(user) {
  return Boolean(user?.expiresAt) && new Date(user.expiresAt).getTime() <= Date.now();
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    username: user.username,
    role: user.role,
    systems: user.systems || [],
    createdAt: user.createdAt,
    expiresAt: user.expiresAt,
    createdBy: user.createdBy,
    active: user.active !== false,
    temporary: Boolean(user.expiresAt)
  };
}

async function cleanupExpiredUsers() {
  const store = await readStore();
  const before = store.users.length;
  store.users = store.users.filter((user) => !isExpired(user));
  if (store.users.length !== before) {
    await writeStore(store);
  }
  return store.users.map(sanitizeUser);
}

async function findUserByUsername(username) {
  const store = await readStore();
  const normalized = String(username || '').trim().toLowerCase();
  const user = store.users.find((item) => String(item.username || '').trim().toLowerCase() === normalized);
  if (!user || isExpired(user) || user.active === false) return null;
  return user;
}

async function validateCredentials(username, password) {
  const user = await findUserByUsername(username);
  if (!user) return null;
  const ok = await bcrypt.compare(String(password || ''), user.passwordHash);
  return ok ? sanitizeUser(user) : null;
}

function generatePassword(length = 10) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

async function createTemporaryAuditorUser({ createdBy = 'admin', days = 1 } = {}) {
  const store = await readStore();
  const suffix = crypto.randomBytes(3).toString('hex');
  const username = `aud-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${suffix}`;
  const plainPassword = generatePassword(8);
  const passwordHash = await bcrypt.hash(plainPassword, 10);
  const expiresAt = new Date(Date.now() + Number(days || 1) * 24 * 60 * 60 * 1000).toISOString();
  const user = {
    username,
    passwordHash,
    role: 'auditoria',
    systems: ['portal', 'rescisao', 'auditoria', 'externo'],
    createdAt: nowIso(),
    expiresAt,
    createdBy,
    active: true
  };
  store.users.push(user);
  await writeStore(store);
  return {
    user: sanitizeUser(user),
    password: plainPassword
  };
}

async function listUsers() {
  await cleanupExpiredUsers();
  const store = await readStore();
  return store.users.filter((user) => !isExpired(user)).map(sanitizeUser);
}

module.exports = {
  validateCredentials,
  createTemporaryAuditorUser,
  listUsers,
  cleanupExpiredUsers,
  sanitizeUser
};
