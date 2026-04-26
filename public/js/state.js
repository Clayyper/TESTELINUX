const STORAGE_KEY = 'rescisao_trct_state_v8';
function loadState(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch(_){return {}}}
function saveState(partial){const next={...loadState(),...partial};localStorage.setItem(STORAGE_KEY,JSON.stringify(next));return next}
function clearState(){localStorage.removeItem(STORAGE_KEY)}
window.AppState={loadState,saveState,clearState};
