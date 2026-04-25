const loginSection = document.getElementById('loginSection');
const menuSection = document.getElementById('menuSection');
const rescisaoSection = document.getElementById('rescisaoSection');
const loginForm = document.getElementById('loginForm');
const loginStatus = document.getElementById('loginStatus');
const logoutBtn = document.getElementById('logoutBtn');
const logoutBtnInner = document.getElementById('logoutBtnInner');
const voltarMenuBtn = document.getElementById('voltarMenuBtn');
const portalUserName = document.getElementById('portalUserName');
const portalUserRole = document.getElementById('portalUserRole');
const systemCards = document.getElementById('systemCards');
const adminPanel = document.getElementById('adminPanel');
const usersTableBody = document.getElementById('usersTableBody');
const tempUserStatus = document.getElementById('tempUserStatus');
const gerarTempUserBtn = document.getElementById('gerarTempUserBtn');
const homeShell = document.getElementById('homeShell');
const homeTitle = document.getElementById('homeTitle');
const homeSubtitle = document.getElementById('homeSubtitle');

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fmtDate(value) {
  if (!value) return 'Sem expiração';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('pt-BR');
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : { ok: false, error: await response.text() };
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || 'Falha na operação.');
  }
  return data;
}

function hideAllViews() {
  loginSection.classList.add('hidden');
  menuSection.classList.add('hidden');
  rescisaoSection.classList.add('hidden');
}

function showLogin(message = '') {
  hideAllViews();
  loginSection.classList.remove('hidden');
  adminPanel.classList.add('hidden');
  homeTitle.textContent = 'Entrar no portal';
  homeSubtitle.textContent = 'Faça login para abrir o menu dos sistemas disponíveis.';
  if (message) loginStatus.innerHTML = message;
  else loginStatus.innerHTML = 'Usuário inicial: <strong>admin</strong> · senha: <strong>123456</strong>';
}

function showMenu(user) {
  hideAllViews();
  menuSection.classList.remove('hidden');
  homeTitle.textContent = 'Portal de Sistemas';
  homeSubtitle.textContent = 'Escolha abaixo o sistema que deseja abrir, sem alterar o endereço principal do projeto.';
  portalUserName.textContent = user.username;
  portalUserRole.textContent = user.role === 'admin'
    ? 'Perfil administrador — acesso aos sistemas e à geração de usuários temporários.'
    : 'Perfil autenticado — acesso ao menu e aos sistemas disponíveis.';

  const cards = [
    {
      title: 'Rescisão',
      desc: 'Abre o sistema interno de cálculo rescisório dentro do próprio portal.',
      action: 'rescisao',
      external: false
    },
    {
      title: 'Cálculo PJ',
      desc: 'Abre o sistema oculto em nova aba, sem exibir o endereço real no menu.',
      action: 'externo',
      external: true
    }
  ];

  systemCards.innerHTML = cards.map((card) => `
    <button class="portal-card portal-card-button" type="button" data-action="${card.action}">
      <h3>${escapeHtml(card.title)}</h3>
      <p>${escapeHtml(card.desc)}</p>
      <span>${card.external ? 'Abrir →' : 'Entrar →'}</span>
    </button>
  `).join('');

  systemCards.querySelectorAll('[data-action="rescisao"]').forEach((btn) => {
    btn.addEventListener('click', () => showRescisao(user));
  });
  systemCards.querySelectorAll('[data-action="externo"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.open('/go/sistema-externo', '_blank', 'noopener,noreferrer');
    });
  });

  if (user.role === 'admin') {
    adminPanel.classList.remove('hidden');
    carregarUsuarios();
  } else {
    adminPanel.classList.add('hidden');
  }
}

function showRescisao(user) {
  hideAllViews();
  rescisaoSection.classList.remove('hidden');
  homeTitle.textContent = 'Portal de Sistemas';
  homeSubtitle.textContent = `Sistema interno aberto para ${user.username}. O endereço principal permanece curto.`;
}

function renderUsers(users) {
  usersTableBody.innerHTML = users.map((user) => `
    <tr>
      <td>${escapeHtml(user.username)}</td>
      <td>${escapeHtml(user.role)}</td>
      <td>${escapeHtml(user.createdBy || '—')}</td>
      <td>${escapeHtml(fmtDate(user.expiresAt))}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="muted">Nenhum usuário disponível.</td></tr>';
}

async function carregarUsuarios() {
  try {
    const data = await fetchJson('/api/auth/users');
    renderUsers(data.users || []);
  } catch (error) {
    usersTableBody.innerHTML = `<tr><td colspan="4" class="muted">${escapeHtml(error.message)}</td></tr>`;
  }
}

async function loadHome() {
  try {
    const session = await fetchJson('/api/auth/session');
    if (session.authenticated && session.user) {
      showMenu(session.user);
      return;
    }
  } catch (_error) {}
  showLogin();
}

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginStatus.textContent = 'Entrando...';
  const payload = Object.fromEntries(new FormData(loginForm).entries());

  try {
    const data = await fetchJson('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    showMenu(data.user);
    loginStatus.innerHTML = '<div class="success-alert alert">Login realizado com sucesso.</div>';
    loginForm.reset();
  } catch (error) {
    showLogin(`<div class="status-warn">${escapeHtml(error.message || 'Falha ao entrar.')}</div>`);
  }
});

async function logoutAndReset() {
  try {
    await fetchJson('/api/auth/logout', { method: 'POST' });
  } catch (_error) {}
  showLogin('Sessão encerrada. Faça login novamente.');
}

logoutBtn?.addEventListener('click', logoutAndReset);
logoutBtnInner?.addEventListener('click', logoutAndReset);
voltarMenuBtn?.addEventListener('click', async () => {
  try {
    const session = await fetchJson('/api/auth/session');
    if (session.authenticated && session.user) return showMenu(session.user);
  } catch (_error) {}
  showLogin();
});

gerarTempUserBtn?.addEventListener('click', async () => {
  try {
    tempUserStatus.textContent = 'Gerando usuário temporário...';
    const data = await fetchJson('/api/auth/temp-user', { method: 'POST' });
    tempUserStatus.innerHTML = `
      <div class="alert success-alert">
        <strong>Usuário criado:</strong> ${escapeHtml(data.user.username)}<br>
        <strong>Senha:</strong> ${escapeHtml(data.password)}<br>
        <strong>Expira em:</strong> ${escapeHtml(fmtDate(data.user.expiresAt))}
      </div>
    `;
    carregarUsuarios();
  } catch (error) {
    tempUserStatus.innerHTML = `<div class="status-warn">${escapeHtml(error.message || 'Falha ao gerar usuário.')}</div>`;
  }
});

loadHome();
