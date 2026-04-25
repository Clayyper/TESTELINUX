(function () {
  const loginShell = document.getElementById('login-shell');
  const appShell = document.getElementById('app-shell');
  const loginForm = document.getElementById('loginForm');
  const loginStatus = document.getElementById('loginStatus');
  const sessionUser = document.getElementById('sessionUser');
  const sessionRole = document.getElementById('sessionRole');
  const menuPanel = document.getElementById('menu-panel');
  const framePanel = document.getElementById('frame-panel');
  const systemFrame = document.getElementById('systemFrame');
  const frameTitle = document.getElementById('frameTitle');
  const adminPanel = document.getElementById('adminPanel');
  const usersTableBody = document.getElementById('usersTableBody');
  const tempUserStatus = document.getElementById('tempUserStatus');
  const externalModal = document.getElementById('externalModal');
  const externalFrame = document.getElementById('externalFrame');

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }


  function setExpanded(enabled) {
    document.body.classList.toggle('portal-expanded', !!enabled);
    const menuBtn = document.getElementById('toggleViewportBtn');
    const frameBtn = document.getElementById('toggleFrameBtn');
    const externalBtn = document.getElementById('toggleExternalBtn');
    const label = enabled ? 'Voltar ao tamanho normal' : 'Usar tela toda';
    if (menuBtn) menuBtn.textContent = label;
    if (frameBtn) frameBtn.textContent = enabled ? 'Reduzir área' : 'Expandir área';
    if (externalBtn) externalBtn.textContent = enabled ? 'Reduzir área' : 'Expandir área';
  }

  function toggleExpanded() {
    setExpanded(!document.body.classList.contains('portal-expanded'));
  }

  function showLogin(message = '') {
    loginShell.style.display = 'flex';
    appShell.style.display = 'none';
    appShell.classList.add('hidden-force');
    appShell.setAttribute('aria-hidden', 'true');
    menuPanel.classList.remove('hidden-panel');
    framePanel.classList.add('hidden-panel');
    adminPanel.classList.add('hidden-panel');
    systemFrame.src = 'about:blank';
    setExpanded(false);
    closeExternalModal();
    loginStatus.innerHTML = message ? `<div class="status-warn">${escapeHtml(message)}</div>` : '';
  }

  function showApp(user) {
    loginShell.style.display = 'none';
    appShell.style.display = 'block';
    appShell.classList.remove('hidden-force');
    appShell.setAttribute('aria-hidden', 'false');
    menuPanel.classList.remove('hidden-panel');
    framePanel.classList.add('hidden-panel');
    sessionUser.textContent = user?.username || 'Usuário';
    sessionRole.textContent = user?.role === 'admin'
      ? 'Administrador — escolha um sistema no portal.'
      : 'Usuário autenticado — selecione o sistema que deseja abrir.';
    if (user?.role === 'admin') {
      adminPanel.classList.remove('hidden-panel');
      loadUsers();
    } else {
      adminPanel.classList.add('hidden-panel');
    }
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    let data;
    try {
      data = await response.json();
    } catch (_e) {
      const raw = await response.text().catch(() => '');
      throw new Error(raw ? `Resposta inválida do servidor: ${raw.slice(0, 120)}` : 'Resposta inválida do servidor.');
    }
    if (!response.ok || data.ok === false) throw new Error(data.error || 'Falha na operação.');
    return data;
  }

  async function loadSession() {
    try {
      const data = await fetchJson('/api/auth/session');
      if (data.authenticated && data.user) showApp(data.user); else showLogin('');
    } catch (_e) { showLogin(''); }
  }

  async function loadUsers() {
    try {
      const data = await fetchJson('/api/auth/users');
      const rows = (data.users || []).map((user) => {
        const expira = user.expiresAt ? new Date(user.expiresAt).toLocaleString('pt-BR') : 'Sem expiração';
        return `<tr><td>${escapeHtml(user.username)}</td><td>${escapeHtml(user.role)}</td><td>${escapeHtml(user.createdBy || '—')}</td><td>${escapeHtml(expira)}</td></tr>`;
      }).join('');
      usersTableBody.innerHTML = rows || '<tr><td colspan="4" class="muted">Nenhum usuário disponível.</td></tr>'
    } catch (error) {
      usersTableBody.innerHTML = `<tr><td colspan="4" class="muted">${escapeHtml(error.message)}</td></tr>`;
    }
  }

  function openInternalSystem(title, src) {
    frameTitle.textContent = title;
    setExpanded(true);
    systemFrame.src = src;
    menuPanel.classList.add('hidden-panel');
    framePanel.classList.remove('hidden-panel');
    closeExternalModal();
  }

  function backToMenu() {
    systemFrame.src = 'about:blank';
    setExpanded(false);
    framePanel.classList.add('hidden-panel');
    menuPanel.classList.remove('hidden-panel');
  }

  function openExternalModal() {
    setExpanded(true);
    externalModal.classList.remove('hidden-panel');
    externalModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    externalFrame.src = '/go/sistema-externo';
  }

  function closeExternalModal() {
    externalFrame.src = 'about:blank';
    if (framePanel.classList.contains('hidden-panel')) setExpanded(false);
    externalModal.classList.add('hidden-panel');
    externalModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  async function logoutAndReset() {
    try { await fetchJson('/api/auth/logout', { method: 'POST' }); } catch (_e) {}
    showLogin('');
  }

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const payload = Object.fromEntries(formData.entries());
    loginStatus.textContent = 'Entrando...';
    try {
      await fetchJson('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      loginForm.reset();
      loginStatus.textContent = '';
      await loadSession();
    } catch (error) {
      showLogin(error.message || 'Falha no login.');
    }
  });

  document.getElementById('toggleViewportBtn')?.addEventListener('click', toggleExpanded);
  document.getElementById('toggleFrameBtn')?.addEventListener('click', toggleExpanded);
  document.getElementById('toggleExternalBtn')?.addEventListener('click', toggleExpanded);
  document.getElementById('logoutBtn')?.addEventListener('click', logoutAndReset);
  document.getElementById('logoutBtnInner')?.addEventListener('click', logoutAndReset);
  document.getElementById('backToMenuBtn')?.addEventListener('click', backToMenu);
  document.getElementById('openRescisaoBtn')?.addEventListener('click', () => openInternalSystem('Rescisão', '/modules/rescisao-module.html'));
  document.getElementById('openPjBtn')?.addEventListener('click', openExternalModal);
  document.getElementById('closeExternalBtn')?.addEventListener('click', closeExternalModal);
  document.getElementById('externalBackdrop')?.addEventListener('click', closeExternalModal);
  document.getElementById('createTempUserBtn')?.addEventListener('click', async () => {
    tempUserStatus.innerHTML = 'Gerando usuário temporário...';
    try {
      const data = await fetchJson('/api/auth/temp-user', { method: 'POST' });
      tempUserStatus.innerHTML = `<div class="success-alert" style="padding:12px 14px;border-radius:12px;">Usuário gerado: <strong>${escapeHtml(data.username)}</strong> | senha: <strong>${escapeHtml(data.password)}</strong> | expira em ${escapeHtml(new Date(data.expiresAt).toLocaleString('pt-BR'))}</div>`;
      loadUsers();
    } catch (error) {
      tempUserStatus.innerHTML = `<div class="status-warn">${escapeHtml(error.message)}</div>`;
    }
  });

  window.addEventListener('message', async (event) => {
    if (event.origin !== window.location.origin || !event.data || typeof event.data !== 'object') return;
    const { type } = event.data;
    if (type === 'portal:back') backToMenu();
    if (type === 'portal:open-auditoria') openInternalSystem('Auditoria TRCT', '/modules/auditoria-module.html');
    if (type === 'portal:open-rescisao') openInternalSystem('Rescisão', '/modules/rescisao-module.html');
    if (type === 'portal:logout') await logoutAndReset();
  });

  loadSession();
})();
