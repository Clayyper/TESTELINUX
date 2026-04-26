const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const publicDir = path.join(__dirname, 'public');

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(publicDir));

// Carrega usuário do cookie para as rotas protegidas
const { attachUser, ensureAuth } = require('./src/middleware/auth');
app.use(attachUser);

// Páginas
app.get('/', (_req, res) => res.sendFile(path.join(publicDir, 'login.html')));
app.get('/rescisao', ensureAuth, (_req, res) => res.sendFile(path.join(publicDir, 'rescisao.html')));
app.get('/auditoria', ensureAuth, (_req, res) => res.sendFile(path.join(publicDir, 'auditoria.html')));
app.get('/health', (_req, res) => res.json({ ok: true, node: process.version }));

// APIs
app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api/calculo', ensureAuth, require('./src/routes/calculo.routes'));
app.use('/api/upload-trct', ensureAuth, require('./src/routes/upload.routes'));
app.use('/api/auditoria', ensureAuth, require('./src/routes/auditoria.routes'));
app.use('/api/relatorio', ensureAuth, require('./src/routes/relatorio.routes'));
app.use('/api/ecac', ensureAuth, require('./src/routes/ecac.routes'));
app.use('/api/fgts', ensureAuth, require('./src/routes/fgts.routes'));

// Sistema externo do portal
app.get('/go/sistema-externo', ensureAuth, (_req, res) => {
  res.redirect(process.env.EXTERNAL_SYSTEM_URL || 'https://lcauditt.vercel.app/');
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: 'Rota não encontrada.', path: req.path });
  }
  return res.status(404).send('Página não encontrada.');
});

app.use((err, _req, res, _next) => {
  console.error(err);
  return res.status(500).json({
    ok: false,
    error: err.message || 'Erro interno do servidor.',
    details: process.env.NODE_ENV === 'production' ? undefined : err.stack
  });
});

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
