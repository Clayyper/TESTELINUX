const crypto = require('crypto');

const COOKIE_NAME = 'rescisao_auth';
const AUTH_SECRET = process.env.AUTH_SECRET || process.env.SESSION_SECRET || 'segredo-local-dev';
const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((acc, item) => {
    const [key, ...rest] = item.trim().split('=');
    if (key) acc[key] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(body).digest('base64url');
  if (!sig || sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp <= Date.now()) return null;
    return {
      username: payload.username,
      role: payload.role,
      systems: payload.systems || [],
      expiresAt: payload.expiresAt || null,
      createdBy: payload.createdBy || null
    };
  } catch (_error) {
    return null;
  }
}

function setAuthCookie(res, user) {
  const maxAgeSeconds = user.expiresAt
    ? Math.max(1, Math.floor((new Date(user.expiresAt).getTime() - Date.now()) / 1000))
    : 7 * 24 * 60 * 60;
  const token = signPayload({
    username: user.username,
    role: user.role,
    systems: user.systems || ['portal', 'rescisao', 'auditoria'],
    expiresAt: user.expiresAt || null,
    createdBy: user.createdBy || null,
    exp: Date.now() + maxAgeSeconds * 1000
  });
  const cookie = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    isProduction ? 'Secure' : ''
  ].filter(Boolean).join('; ');
  res.setHeader('Set-Cookie', cookie);
}

function clearAuthCookie(res) {
  const cookie = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    isProduction ? 'Secure' : ''
  ].filter(Boolean).join('; ');
  res.setHeader('Set-Cookie', cookie);
}

function attachUser(req, _res, next) {
  req.user = verifyToken(parseCookies(req)[COOKIE_NAME]);
  next();
}

function ensureAuth(req, res, next) {
  if (!req.user) {
    if (req.path.startsWith('/api/') || req.originalUrl.startsWith('/api/')) {
      return res.status(401).json({ ok: false, error: 'Não autenticado.' });
    }
    return res.redirect('/');
  }
  return next();
}

function ensureAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, error: 'Não autenticado.' });
  if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Acesso restrito ao administrador.' });
  return next();
}

module.exports = { attachUser, ensureAuth, ensureAdmin, setAuthCookie, clearAuthCookie };
