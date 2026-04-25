const logoutBtn = document.getElementById('logoutBtn');

logoutBtn?.addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (_error) {
  } finally {
    window.location.href = '/';
  }
});
