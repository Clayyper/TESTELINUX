const crypto = require('crypto');

const ADMIN_USER = (process.env.ADMIN_USER || process.env.ADMIN_USERNAME || process.env.ADMIN_DEFAULT_USERNAME || 'admin').trim();
const ADMIN_PASS = (process.env.ADMIN_PASS || process.env.ADMIN_PASSWORD || process.env.ADMIN_DEFAULT_PASSWORD || '282728').trim();
const tempUsers = new Map();

function nowIso() { return new Date().toISOString(); }
function isExpired(user) { return Boolean(user?.expiresAt) && new Date(user.expiresAt).getTime() <= Date.now(); }
function sanitizeUser(user) {
  if (!user) return null;
  return {
    username: user.username,
    role: user.role,
    systems: user.systems || [],
    createdAt: user.createdAt || null,
    expiresAt: user.expiresAt || null,
    createdBy: user.createdBy || null,
    active: user.active !== false,
    temporary: Boolean(user.expiresAt)
  };
}
function cleanupExpiredUsers() {
  for (const [username, user] of tempUsers.entries()) {
    if (isExpired(user)) tempUsers.delete(username);
  }
}
async function validateCredentials(username, password) {
  cleanupExpiredUsers();
  const u = String(username || '').trim();
  const p = String(password || '').trim();
  if (u === ADMIN_USER && p === ADMIN_PASS) {
    return sanitizeUser({
      username: ADMIN_USER,
      role: 'admin',
      systems: ['portal', 'rescisao', 'auditoria', 'externo'],
      createdAt: nowIso(),
      createdBy: 'system',
      active: true
    });
  }
  const temp = tempUsers.get(u);
  if (temp && temp.password === p && !isExpired(temp)) return sanitizeUser(temp);
  return null;
}
function generatePassword(length = 8) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}
async function createTemporaryAuditorUser({ createdBy = 'admin', days = 1 } = {}) {
  cleanupExpiredUsers();
  const suffix = crypto.randomBytes(3).toString('hex');
  const username = `aud-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${suffix}`;
  const plainPassword = generatePassword(8);
  const expiresAt = new Date(Date.now() + Number(days || 1) * 24 * 60 * 60 * 1000).toISOString();
  const user = {
    username,
    password: plainPassword,
    role: 'auditoria',
    systems: ['portal', 'rescisao', 'auditoria', 'externo'],
    createdAt: nowIso(),
    expiresAt,
    createdBy,
    active: true
  };
  tempUsers.set(username, user);
  return { user: sanitizeUser(user), password: plainPassword };
}
async function listUsers() {
  cleanupExpiredUsers();
  return [
    sanitizeUser({ username: ADMIN_USER, role: 'admin', systems: ['portal', 'rescisao', 'auditoria', 'externo'], createdBy: 'system', active: true }),
    ...Array.from(tempUsers.values()).map(sanitizeUser)
  ];
}
module.exports = { validateCredentials, createTemporaryAuditorUser, listUsers, cleanupExpiredUsers, sanitizeUser };
