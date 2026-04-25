const form = document.getElementById('calculoForm');
const limparBtn = document.getElementById('limparBtn');
const resultadoVazio = document.getElementById('resultadoVazio');
const resultadoBox = document.getElementById('resultadoBox');
const resumoTotais = document.getElementById('resumoTotais');
const rubricasTabela = document.getElementById('rubricasTabela');
const memoriaLista = document.getElementById('memoriaLista');
const avisosLista = document.getElementById('avisosLista');
const tabButtons = document.querySelectorAll('.tab-btn[data-tab]');
const panels = document.querySelectorAll('.tab-panel');

function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showMessage(message) {
  resultadoVazio.classList.remove('hidden');
  resultadoBox.classList.add('hidden');
  resultadoVazio.innerHTML = message;
}

async function parseApiResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  const text = await response.text();
  throw new Error(`A API respondeu fora do padrão JSON. Trecho: ${text.slice(0, 120)}`);
}

function formToJSON(formElement) {
  const data = new FormData(formElement);
  const payload = {};
  for (const [key, value] of data.entries()) payload[key] = value;
  payload.feriasVencidasEmDobro = formElement.querySelector('[name="feriasVencidasEmDobro"]').checked;
  return normalizePayload(payload);
}


function normalizeDateInputValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const yyyy = iso[1];
    const mm = iso[2].padStart(2, '0');
    const dd = iso[3].padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return raw;
}

function displayDateValue(value) {
  const normalized = normalizeDateInputValue(value);
  const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return value || '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function getDateTextInput(name) {
  return form.elements.namedItem(name);
}

function getNativeDateInput(name) {
  return document.querySelector(`[data-native-for="${name}"]`);
}

function syncDateField(name, sourceValue, source = 'text') {
  const textInput = getDateTextInput(name);
  const nativeInput = getNativeDateInput(name);
  const normalized = normalizeDateInputValue(sourceValue);

  if (textInput) {
    textInput.value = source === 'native' ? displayDateValue(normalized) : (sourceValue || '');
  }
  if (nativeInput) {
    nativeInput.value = normalized;
  }
}

function normalizePayload(payload) {
  payload.dataAdmissao = normalizeDateInputValue(payload.dataAdmissao);
  payload.dataDemissao = normalizeDateInputValue(payload.dataDemissao);
  payload.inicioPeriodoAquisitivo = normalizeDateInputValue(payload.inicioPeriodoAquisitivo);
  return payload;
}

function setTab(tabId) {
  tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabId));
  panels.forEach((panel) => panel.classList.toggle('hidden', panel.id !== tabId));
}

function clearResultado() {
  resumoTotais.innerHTML = '';
  rubricasTabela.innerHTML = '';
  memoriaLista.innerHTML = '';
  avisosLista.innerHTML = '';
  resultadoBox.classList.add('hidden');
  resultadoVazio.classList.remove('hidden');
  resultadoVazio.textContent = 'Preencha os campos e clique em calcular.';
  setTab('tab-calculo');
}

function renderResultado(resultado) {
  resultadoVazio.classList.add('hidden');
  resultadoBox.classList.remove('hidden');

  resumoTotais.innerHTML = `
    <div class="summary-item"><small>Bruto</small><strong>${formatBRL(resultado.totais.bruto)}</strong></div>
    <div class="summary-item"><small>Descontos</small><strong>${formatBRL(resultado.totais.descontos)}</strong></div>
    <div class="summary-item"><small>Líquido</small><strong>${formatBRL(resultado.totais.liquido)}</strong></div>
  `;

  const rows = Object.entries(resultado.rubricas)
    .map(([chave, valor]) => `<tr><td>${escapeHtml(chave)}</td><td>${formatBRL(valor)}</td></tr>`)
    .join('');

  rubricasTabela.innerHTML = `
    <table class="table">
      <thead><tr><th>Rubrica</th><th>Valor</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  memoriaLista.innerHTML = (resultado.memoriaTexto || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  avisosLista.innerHTML = (resultado.avisos || []).map((item) => `<div class="alert">${escapeHtml(item)}</div>`).join('');
}

function restoreForm() {
  const state = window.AppState?.loadState?.() || {};
  const formulario = state.formulario || {};
  Object.entries(formulario).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (!field) return;
    if (field.type === 'checkbox') {
      field.checked = Boolean(value);
    } else if (key === 'dataAdmissao' || key === 'dataDemissao' || key === 'inicioPeriodoAquisitivo') {
      field.value = displayDateValue(value);
      syncDateField(key, value, 'text');
    } else {
      field.value = value;
    }
  });

  if (state.calculo && state.calculo.totais) {
    renderResultado(state.calculo);
  } else {
    clearResultado();
  }
}

function persistForm() {
  const payload = formToJSON(form);
  window.AppState?.saveState?.({ formulario: payload });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = formToJSON(form);
  persistForm();
  showMessage('Calculando...');

  try {
    const response = await fetch('/api/calculo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const resultado = await parseApiResponse(response);
    if (!response.ok || resultado.ok === false) {
      throw new Error(resultado.error || resultado.details || 'Falha ao calcular a rescisão.');
    }

    localStorage.setItem('ultimoCalculoRescisao', JSON.stringify(resultado));
    window.AppState?.saveState?.({ formulario: payload, calculo: resultado });
    renderResultado(resultado);
    setTab('tab-resultado');
  } catch (error) {
    showMessage(`<div class="status-warn">Falha ao calcular: ${escapeHtml(error.message || 'erro desconhecido')}</div>`);
  }
});

form.addEventListener('input', persistForm);
form.addEventListener('change', persistForm);

function clearFormFields() {
  Array.from(form.elements).forEach((field) => {
    if (!field || !field.name) return;
    if (field.type === 'checkbox') {
      field.checked = false;
    } else if (field.tagName === 'SELECT') {
      field.selectedIndex = 0;
    } else if (field.type !== 'submit' && field.type !== 'button') {
      field.value = '';
    }
  });
  syncDateField('dataAdmissao', '', 'text');
  syncDateField('dataDemissao', '', 'text');
}

limparBtn?.addEventListener('click', () => {
  clearFormFields();
  localStorage.removeItem('ultimoCalculoRescisao');
  window.AppState?.clearState?.();
  clearResultado();
});

tabButtons.forEach((btn) => btn.addEventListener('click', () => setTab(btn.dataset.tab)));

function setupDateFields() {
  ['dataAdmissao', 'dataDemissao'].forEach((name) => {
    const textInput = getDateTextInput(name);
    const nativeInput = getNativeDateInput(name);
    const button = document.querySelector(`[data-picker-for="${name}"]`);
    if (!textInput) return;

    textInput.addEventListener('blur', () => syncDateField(name, textInput.value, 'text'));
    textInput.addEventListener('input', () => {
      if (!textInput.value.trim()) syncDateField(name, '', 'text');
    });

    if (nativeInput) {
      nativeInput.addEventListener('change', () => syncDateField(name, nativeInput.value, 'native'));
    }

    const openNativePicker = () => {
      if (!nativeInput) return;
      try {
        if (typeof nativeInput.showPicker === 'function') {
          nativeInput.showPicker();
          return;
        }
      } catch (_err) {}
      nativeInput.focus();
      nativeInput.click();
    };

    if (button && nativeInput) {
      button.addEventListener('click', openNativePicker);
    }

    if (nativeInput) {
      nativeInput.addEventListener('click', openNativePicker);
      nativeInput.addEventListener('focus', () => {
        textInput?.parentElement?.classList.add('picker-open');
      });
      nativeInput.addEventListener('blur', () => {
        textInput?.parentElement?.classList.remove('picker-open');
      });
    }
  });
}

setupDateFields();
restoreForm();
