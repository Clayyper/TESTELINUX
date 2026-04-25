const express = require('express');
const path = require('path');
const { validateCredentials, createTemporaryAuditorUser, listUsers } = require('../services/userStore');
const { clearAuthCookie, ensureAdmin, ensureAuth, setAuthCookie } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const user = await validateCredentials(username, password);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Usuário ou senha inválidos.' });
    }
    setAuthCookie(res, user);
    return res.json({ ok: true, user, redirectTo: '/' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Falha no login.', details: error.message });
  }
});

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  return res.json({ ok: true });
});

router.get('/session', (req, res) => {
  return res.json({ ok: true, authenticated: Boolean(req.user), user: req.user || null });
});

router.get('/users', ensureAuth, ensureAdmin, async (_req, res) => {
  return res.json({ ok: true, users: await listUsers() });
});

router.post('/temp-user', ensureAuth, ensureAdmin, async (req, res) => {
  try {
    const result = await createTemporaryAuditorUser({ createdBy: req.user.username, days: 1 });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Falha ao criar usuário temporário.', details: error.message });
  }
});

module.exports = router;
