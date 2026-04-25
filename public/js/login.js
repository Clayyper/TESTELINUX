const form = document.getElementById('loginForm');
const statusBox = document.getElementById('loginStatus');

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  statusBox.innerHTML = 'Entrando...';

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || 'Falha no login.');
    }
    window.location.href = data.redirectTo || '/';
  } catch (error) {
    statusBox.innerHTML = `<div class="status-warn">${escapeHtml(error.message || 'Erro ao entrar.')}</div>`;
  }
});
