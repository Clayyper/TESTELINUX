const crypto = require('crypto');
const { cleanupExpiredUsers } = require('../services/userStore');

const COOKIE_NAME = 'rescisao_auth';
const SECRET = process.env.AUTH_SECRET || 'rescisao-auth-secret-change-me';

function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp <= Date.now()) return null;
    return payload;
  } catch (_error) {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((acc, item) => {
    const [key, ...rest] = item.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

function setAuthCookie(res, user) {
  const ttlMs = user.expiresAt ? Math.max(new Date(user.expiresAt).getTime() - Date.now(), 0) : 7 * 24 * 60 * 60 * 1000;
  const token = signPayload({
    username: user.username,
    role: user.role,
    systems: user.systems || [],
    expiresAt: user.expiresAt,
    exp: Date.now() + ttlMs
  });
  const cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(ttlMs / 1000)}` + (process.env.NODE_ENV === 'production' ? '; Secure' : '');
  res.setHeader('Set-Cookie', cookie);
}

function clearAuthCookie(res) {
  const cookie = `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` + (process.env.NODE_ENV === 'production' ? '; Secure' : '');
  res.setHeader('Set-Cookie', cookie);
}

async function attachUser(req, _res, next) {
  await cleanupExpiredUsers();
  const cookies = parseCookies(req);
  const payload = verifyToken(cookies[COOKIE_NAME]);
  req.user = payload || null;
  next();
}

function wantsJson(req) {
  const accept = req.headers.accept || '';
  return req.path.startsWith('/api/') || accept.includes('application/json');
}

function ensureAuth(req, res, next) {
  if (req.user) return next();
  if (wantsJson(req)) return res.status(401).json({ ok: false, error: 'Não autenticado.' });
  return res.redirect('/');
}

function ensureAdmin(req, res, next) {
  if (req.user?.role === 'admin') return next();
  if (wantsJson(req)) return res.status(403).json({ ok: false, error: 'Acesso restrito ao administrador.' });
  return res.redirect('/');
}

function ensureSystemAccess(system) {
  return (req, res, next) => {
    if (!req.user) {
      if (wantsJson(req)) return res.status(401).json({ ok: false, error: 'Não autenticado.' });
      return res.redirect('/');
    }
    if (req.user.role === 'admin') return next();
    const systems = req.user.systems || [];
    if (systems.includes(system)) return next();
    if (wantsJson(req)) return res.status(403).json({ ok: false, error: `Sem acesso ao sistema ${system}.` });
    return res.redirect('/');
  };
}

module.exports = {
  attachUser,
  ensureAuth,
  ensureAdmin,
  ensureSystemAccess,
  setAuthCookie,
  clearAuthCookie
};
