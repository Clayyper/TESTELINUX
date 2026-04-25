const portalUserName = document.getElementById('portalUserName');
const portalUserRole = document.getElementById('portalUserRole');
const systemCards = document.getElementById('systemCards');
const adminPanel = document.getElementById('adminPanel');
const usersTableBody = document.getElementById('usersTableBody');
const tempUserStatus = document.getElementById('tempUserStatus');
const gerarTempUserBtn = document.getElementById('gerarTempUserBtn');
const logoutBtn = document.getElementById('logoutBtn');
const portalSubtitle = document.getElementById('portalSubtitle');

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

function systemCard(title, desc, href) {
  return `
    <a class="portal-card" href="${href}">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(desc)}</p>
      <span>Acessar →</span>
    </a>
  `;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || 'Falha na operação.');
  }
  return data;
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

async function loadPortal() {
  try {
    const session = await fetchJson('/api/auth/session');
    if (!session.authenticated || !session.user) {
      window.location.href = '/';
      return;
    }
    const user = session.user;
    portalUserName.textContent = user.username;
    portalUserRole.textContent = user.role === 'admin'
      ? 'Perfil administrador — acesso total ao portal, cálculo e auditoria.'
      : 'Perfil auditoria — acesso ao portal e ao sistema de auditoria.';
    portalSubtitle.textContent = user.role === 'admin'
      ? 'Escolha um sistema ou gere usuários temporários para auditoria.'
      : 'Escolha um sistema dentro do seu perfil.';

    const cards = [];
    if (user.role === 'admin' || (user.systems || []).includes('rescisao')) {
      cards.push(systemCard('Sistema de Rescisão', 'Cálculo rescisório com memória de cálculo e totais.', '/');
    }
    if (user.role === 'admin' || (user.systems || []).includes('auditoria')) {
      cards.push(systemCard('Auditoria TRCT', 'Importação de PDF/imagem, comparação e relatório.', '/auditoria'));
    }
    systemCards.innerHTML = cards.join('');

    if (user.role === 'admin') {
      adminPanel.classList.remove('hidden');
      const usersData = await fetchJson('/api/auth/users');
      renderUsers(usersData.users);
    }
  } catch (error) {
    systemCards.innerHTML = `<div class="status-warn">${escapeHtml(error.message || 'Falha ao carregar o portal.')}</div>`;
  }
}

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
    const usersData = await fetchJson('/api/auth/users');
    renderUsers(usersData.users);
  } catch (error) {
    tempUserStatus.innerHTML = `<div class="status-warn">${escapeHtml(error.message || 'Falha ao gerar usuário.')}</div>`;
  }
});

logoutBtn?.addEventListener('click', async () => {
  try {
    await fetchJson('/api/auth/logout', { method: 'POST' });
  } finally {
    window.location.href = '/';
  }
});

loadPortal();
