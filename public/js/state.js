const STORAGE_KEY = 'rescisao_trct_state_v7';

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (_error) {
    return {};
  }
}

function saveState(partial) {
  const current = loadState();
  const next = { ...current, ...partial };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

window.AppState = { loadState, saveState, clearState };
