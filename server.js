// Servidor sem dependências externas: funciona local e na Vercel.
// Local: lê .env. Vercel: lê Environment Variables do painel.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');

loadDotEnv();

const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const COOKIE_NAME = 'rescisao_auth';
const AUTH_SECRET = process.env.AUTH_SECRET || process.env.SESSION_SECRET || 'segredo-local-dev';
const ADMIN_USER = (process.env.ADMIN_USER || process.env.ADMIN_USERNAME || process.env.ADMIN_DEFAULT_USERNAME || 'admin').trim();
const ADMIN_PASS = (process.env.ADMIN_PASS || process.env.ADMIN_PASSWORD || process.env.ADMIN_DEFAULT_PASSWORD || '282728').trim();
const EXTERNAL_SYSTEM_URL = process.env.EXTERNAL_SYSTEM_URL || 'https://lcauditt.vercel.app/';
const tempUsers = new Map();

function loadDotEnv() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const clean = line.trim();
    if (!clean || clean.startsWith('#') || !clean.includes('=')) continue;
    const idx = clean.indexOf('=');
    const key = clean.slice(0, idx).trim();
    let value = clean.slice(idx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

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
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp <= Date.now()) return null;
    return payload;
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
    systems: user.systems || ['rescisao', 'pj'],
    expiresAt: user.expiresAt || null,
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
  const cookie = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0', isProduction ? 'Secure' : ''].filter(Boolean).join('; ');
  res.setHeader('Set-Cookie', cookie);
}

function cleanupTempUsers() {
  const now = Date.now();
  for (const [username, user] of tempUsers.entries()) {
    if (user.expiresAt && new Date(user.expiresAt).getTime() <= now) tempUsers.delete(username);
  }
}

function getCurrentUser(req) {
  cleanupTempUsers();
  return verifyToken(parseCookies(req)[COOKIE_NAME]);
}

function publicUser(user) {
  return {
    username: user.username,
    role: user.role,
    systems: user.systems || ['rescisao', 'pj'],
    expiresAt: user.expiresAt || null,
    createdBy: user.createdBy || null
  };
}

function allUsers() {
  cleanupTempUsers();
  return [
    { username: ADMIN_USER, role: 'admin', systems: ['rescisao', 'pj'], createdBy: 'sistema', expiresAt: null },
    ...Array.from(tempUsers.values())
  ].map(publicUser);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Corpo da requisição muito grande.'));
      }
    });
    req.on('end', () => {
      const type = req.headers['content-type'] || '';
      if (type.includes('application/json')) {
        try { return resolve(body ? JSON.parse(body) : {}); } catch (_e) { return resolve({}); }
      }
      const params = new URLSearchParams(body);
      resolve(Object.fromEntries(params.entries()));
    });
    req.on('error', reject);
  });
}

function mimeType(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.pdf': 'application/pdf'
  }[ext] || 'application/octet-stream';
}

function serveFile(res, filePath, fallbackIndex = false) {
  const safePath = path.normalize(filePath);
  if (!safePath.startsWith(PUBLIC_DIR) && !safePath.startsWith(ROOT)) return sendJson(res, 403, { ok: false, error: 'Acesso negado.' });
  fs.readFile(safePath, (err, data) => {
    if (err) {
      if (fallbackIndex) return serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
      return sendJson(res, 404, { ok: false, error: 'Arquivo não encontrado.' });
    }
    res.writeHead(200, { 'Content-Type': mimeType(safePath) });
    res.end(data);
  });
}

async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);

    if (req.method === 'GET' && pathname === '/') return serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
    if (req.method === 'GET' && pathname === '/health') return sendJson(res, 200, { ok: true, env: isProduction ? 'vercel/producao' : 'local', adminUser: ADMIN_USER });
    if (req.method === 'GET' && pathname === '/api/debug-config') {
      return sendJson(res, 200, { ok: true, runningOn: isProduction ? 'vercel/producao' : 'local', adminUser: ADMIN_USER, hasAdminPassword: Boolean(ADMIN_PASS), hasAuthSecret: Boolean(AUTH_SECRET), externalSystemConfigured: Boolean(EXTERNAL_SYSTEM_URL) });
    }

    if (req.method === 'GET' && pathname === '/api/auth/session') {
      const user = getCurrentUser(req);
      return sendJson(res, 200, { ok: true, authenticated: Boolean(user), user: user ? publicUser(user) : null });
    }

    if (req.method === 'POST' && pathname === '/api/auth/login') {
      const data = await readBody(req);
      cleanupTempUsers();
      const username = String(data.username || data.usuario || '').trim();
      const password = String(data.password || data.senha || '').trim();
      let user = null;
      if (username === ADMIN_USER && password === ADMIN_PASS) user = { username: ADMIN_USER, role: 'admin', systems: ['rescisao', 'pj'], expiresAt: null };
      else {
        const temp = tempUsers.get(username);
        if (temp && temp.password === password) user = temp;
      }
      if (!user) return sendJson(res, 401, { ok: false, error: 'Usuário ou senha inválidos.' });
      setAuthCookie(res, user);
      return sendJson(res, 200, { ok: true, user: publicUser(user) });
    }

    if (req.method === 'POST' && pathname === '/api/auth/logout') {
      clearAuthCookie(res);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && pathname === '/api/auth/users') {
      const user = getCurrentUser(req);
      if (!user) return sendJson(res, 401, { ok: false, error: 'Não autenticado.' });
      if (user.role !== 'admin') return sendJson(res, 403, { ok: false, error: 'Acesso restrito ao administrador.' });
      return sendJson(res, 200, { ok: true, users: allUsers() });
    }

    if (req.method === 'POST' && pathname === '/api/auth/temp-user') {
      const current = getCurrentUser(req);
      if (!current) return sendJson(res, 401, { ok: false, error: 'Não autenticado.' });
      if (current.role !== 'admin') return sendJson(res, 403, { ok: false, error: 'Acesso restrito ao administrador.' });
      const suffix = crypto.randomBytes(3).toString('hex');
      const username = `auditoria_${suffix}`;
      const password = crypto.randomBytes(4).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const user = { username, password, role: 'auditoria', systems: ['rescisao', 'pj'], createdBy: current.username, expiresAt };
      tempUsers.set(username, user);
      return sendJson(res, 200, { ok: true, user: publicUser(user), password });
    }

    if (req.method === 'GET' && pathname === '/go/sistema-externo') {
      const user = getCurrentUser(req);
      if (!user) return redirect(res, '/');
      return redirect(res, EXTERNAL_SYSTEM_URL);
    }

    if (req.method === 'GET' && pathname === '/auditoria') {
      const user = getCurrentUser(req);
      if (!user) return redirect(res, '/');
      return serveFile(res, path.join(PUBLIC_DIR, 'auditoria.html'));
    }

    if (req.method === 'GET') {
      const requested = path.join(PUBLIC_DIR, pathname.replace(/^\//, ''));
      if (fs.existsSync(requested) && fs.statSync(requested).isFile()) return serveFile(res, requested);
      if (pathname.startsWith('/api/')) return sendJson(res, 404, { ok: false, error: 'Rota não encontrada.' });
      return serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
    }

    return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || 'Erro interno.' });
  }
}

if (process.env.VERCEL !== '1') {
  http.createServer(handler).listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    console.log(`Login local: ${ADMIN_USER} / senha configurada no .env`);
  });
}

module.exports = handler;
