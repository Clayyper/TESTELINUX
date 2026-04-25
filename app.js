const express = require('express');
const path = require('path');

const calculoRoutes = require('./src/routes/calculo.routes');
const uploadRoutes = require('./src/routes/upload.routes');
const auditoriaRoutes = require('./src/routes/auditoria.routes');
const relatorioRoutes = require('./src/routes/relatorio.routes');
const authRoutes = require('./src/routes/auth.routes');
const { attachUser, ensureAuth, ensureSystemAccess } = require('./src/middleware/auth');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(attachUser);
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'rescisao-trct-auditoria', version: '8.0.0' });
});

app.use('/api/auth', authRoutes);
app.use('/api/calculo', ensureSystemAccess('rescisao'), calculoRoutes);
app.use('/api/upload-trct', ensureSystemAccess('auditoria'), uploadRoutes);
app.use('/api/auditoria', ensureSystemAccess('auditoria'), auditoriaRoutes);
app.use('/api/relatorio', ensureSystemAccess('auditoria'), relatorioRoutes);

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (_req, res) => {
  res.redirect('/');
});

app.get('/portal', (_req, res) => {
  res.redirect('/');
});

app.get('/rescisao', ensureAuth, (_req, res) => {
  res.redirect('/');
});

app.get('/auditoria', ensureAuth, (_req, res) => {
  res.redirect('/');
});

app.get('/go/sistema-externo', ensureAuth, (_req, res) => {
  const externalUrl = process.env.EXTERNAL_SYSTEM_URL || 'https://lcauditt.vercel.app/';
  return res.redirect(externalUrl);
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: 'Rota de API não encontrada.', path: req.path });
  }
  return res.redirect('/');
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({
    ok: false,
    error: 'Erro interno do servidor.',
    details: err.message
  });
});

module.exports = app;
