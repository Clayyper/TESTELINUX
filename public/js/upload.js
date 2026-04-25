const uploadForm = document.getElementById('uploadForm');
const uploadStatus = document.getElementById('uploadStatus');
const camposTRCT = document.getElementById('camposTRCT');
const compararBtn = document.getElementById('compararBtn');
const gerarPdfBtn = document.getElementById('gerarPdfBtn');
const limparAuditoriaBtn = document.getElementById('limparAuditoriaBtn');
const auditoriaVazia = document.getElementById('auditoriaVazia');
const auditoriaBox = document.getElementById('auditoriaBox');
const auditoriaResumo = document.getElementById('auditoriaResumo');
const auditoriaTabela = document.getElementById('auditoriaTabela');

let trctImportado = null;
let auditoriaAtual = null;

function formatBRL(value) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) {
    return '—';
  }
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${Math.round(Number(value) * 100)}%`;
}

function isNumericField(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function parseApiResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  const text = await response.text();
  throw new Error(`A API respondeu fora do padrão JSON. Trecho: ${text.slice(0, 160)}`);
}

function resetAuditoriaUI() {
  camposTRCT.innerHTML = '';
  camposTRCT.classList.add('hidden');
  auditoriaResumo.innerHTML = '';
  auditoriaTabela.innerHTML = '';
  auditoriaBox.classList.add('hidden');
  auditoriaVazia.classList.remove('hidden');
  auditoriaVazia.textContent = 'Importe um TRCT e clique em comparar.';
}

function buildFriendlyStatus(data) {
  const lines = [];
  lines.push(`Arquivo: <strong>${escapeHtml(data.arquivo?.nome || 'sem nome')}</strong>`);
  lines.push(`Estratégia: <strong>${escapeHtml(data.estrategia || 'desconhecida')}</strong>`);

  if (data.model) {
    lines.push(`Modelo detectado: <strong>${escapeHtml(data.model.modelLabel)}</strong> (${formatPercent(data.model.confidence)})`);
  }

  if (data.confidence) {
    lines.push(`Confiança média dos campos: <strong>${escapeHtml(data.confidence.label)}</strong> (${formatPercent(data.confidence.average)})`);
  }

  if (data.estrategia === 'ocr') {
    lines.push('<div class="status-tip"><strong>OCR ativado.</strong> O sistema leu o documento como imagem. Confira os campos extraídos antes de comparar.</div>');
  }

  if (data.ok === false && data.erroLeitura?.codigo === 'PDF_PARSE_FAILED') {
    lines.push('<div class="status-warn"><strong>Leitura automática não concluída.</strong> O PDF está com estrutura interna inconsistente.</div>');
    lines.push('<div class="status-tip">Tente abrir o documento no navegador ou no Adobe Reader e usar <strong>Imprimir &gt; Salvar como PDF</strong>. Depois, reimporte o novo arquivo.</div>');
  }

  if (data.ok === false && data.erroLeitura?.codigo === 'OCR_EMPTY') {
    lines.push('<div class="status-warn"><strong>OCR insuficiente.</strong> O sistema não conseguiu extrair texto suficiente. Confira se a página está nítida e bem enquadrada.</div>');
  }

  (data.observacoes || []).forEach((obs) => {
    lines.push(`<div>${escapeHtml(obs)}</div>`);
  });

  return lines.join('<br>');
}

function renderCamposTRCT(dados) {
  camposTRCT.classList.remove('hidden');
  const campos = dados.campos || {};
  const detalhados = dados.camposDetalhados || {};

  camposTRCT.innerHTML = Object.entries(campos).map(([key, value]) => {
    const meta = detalhados[key] || {};
    const metaHtml = `<small class="muted">confiança: ${escapeHtml(meta.confidenceLabel || 'baixa')} (${formatPercent(meta.confidence || 0)}) · origem: ${escapeHtml(meta.source || '—')}</small>`;

    if (isNumericField(value)) {
      return `
        <label>
          ${escapeHtml(key)}
          ${metaHtml}
          <input data-chave="${escapeHtml(key)}" data-tipo="number" type="number" step="0.01" value="${Number(value)}">
        </label>
      `;
    }

    return `
      <label>
        ${escapeHtml(key)}
        ${metaHtml}
        <input data-chave="${escapeHtml(key)}" data-tipo="text" type="text" value="${escapeHtml(value ?? '')}">
      </label>
    `;
  }).join('');
}

function collectCamposEditados() {
  const campos = {};
  camposTRCT.querySelectorAll('input[data-chave]').forEach((input) => {
    if (input.dataset.tipo === 'number') {
      campos[input.dataset.chave] = input.value === '' ? null : Number(input.value);
    } else {
      campos[input.dataset.chave] = input.value || null;
    }
  });
  return campos;
}

function renderAuditoria(data) {
  auditoriaAtual = data;
  auditoriaVazia.classList.add('hidden');
  auditoriaBox.classList.remove('hidden');

  auditoriaResumo.innerHTML = `
    <div class="summary-item"><small>Total rubricas</small><strong>${data.resumo.totalRubricas}</strong></div>
    <div class="summary-item"><small>OK</small><strong>${data.resumo.ok}</strong></div>
    <div class="summary-item"><small>Divergentes</small><strong>${data.resumo.divergentes}</strong></div>
    <div class="summary-item"><small>Não lidas</small><strong>${data.resumo.naoLidas ?? 0}</strong></div>
  `;

  auditoriaTabela.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Rubrica</th>
          <th>Sistema</th>
          <th>TRCT</th>
          <th>Diferença</th>
          <th>Conf.</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${data.auditoria.map((item) => `
          <tr>
            <td>${escapeHtml(item.rubrica)}</td>
            <td>${formatBRL(item.sistema)}</td>
            <td>${formatBRL(item.trct)}</td>
            <td>${formatBRL(item.diferenca)}</td>
            <td>${escapeHtml(item.confidenceLabel || '—')}</td>
            <td><span class="badge ${item.status === 'OK' ? 'ok' : item.status === 'NAO_LIDO' ? 'warn' : 'danger'}">${escapeHtml(item.status)}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function restoreSavedState() {
  const state = window.AppState?.loadState?.() || {};
  resetAuditoriaUI();

  if (state.trctImportado) {
    trctImportado = state.trctImportado;
    uploadStatus.innerHTML = buildFriendlyStatus(state.trctImportado);
    renderCamposTRCT(state.trctImportado);
  }

  if (state.auditoriaAtual) {
    renderAuditoria(state.auditoriaAtual);
  }
}

uploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(uploadForm);
  const arquivo = document.getElementById('arquivoTRCT')?.files?.[0];
  if (!arquivo) {
    uploadStatus.innerHTML = '<div class="status-warn">Selecione um arquivo antes de importar.</div>';
    return;
  }

  uploadStatus.innerHTML = 'Importando documento...';

  try {
    const response = await fetch('/api/upload-trct', {
      method: 'POST',
      body: formData
    });

    const data = await parseApiResponse(response);
    if (!response.ok && !data) {
      throw new Error('Falha ao importar o documento.');
    }

    trctImportado = data;
    auditoriaAtual = null;
    resetAuditoriaUI();
    window.AppState?.saveState?.({ trctImportado: data, auditoriaAtual: null });
    uploadStatus.innerHTML = buildFriendlyStatus(data);
    renderCamposTRCT(data);
  } catch (error) {
    uploadStatus.innerHTML = `<div class="status-warn">Falha ao importar o documento: ${escapeHtml(error.message || 'erro desconhecido')}</div>`;
  }
});

compararBtn.addEventListener('click', async () => {
  const state = window.AppState?.loadState?.() || {};
  const ultimoCalculo = state.calculo || JSON.parse(localStorage.getItem('ultimoCalculoRescisao') || 'null');
  if (!ultimoCalculo) {
    uploadStatus.textContent = 'Faça um cálculo na tela principal antes de comparar.';
    return;
  }
  if (!trctImportado) {
    uploadStatus.textContent = 'Importe um TRCT antes de comparar.';
    return;
  }

  const payload = {
    calculado: ultimoCalculo,
    trct: {
      ...trctImportado,
      campos: collectCamposEditados()
    }
  };

  try {
    const response = await fetch('/api/auditoria', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await parseApiResponse(response);
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || data.details || 'Falha ao comparar o TRCT.');
    }

    renderAuditoria(data);
    window.AppState?.saveState?.({
      trctImportado: payload.trct,
      auditoriaAtual: data
    });
  } catch (error) {
    uploadStatus.innerHTML = `<div class="status-warn">Falha na auditoria: ${escapeHtml(error.message || 'erro desconhecido')}</div>`;
  }
});

gerarPdfBtn.addEventListener('click', async () => {
  const state = window.AppState?.loadState?.() || {};
  const calculo = state.calculo || JSON.parse(localStorage.getItem('ultimoCalculoRescisao') || 'null');
  const trct = trctImportado ? { ...trctImportado, campos: collectCamposEditados() } : state.trctImportado;
  const auditoria = auditoriaAtual || state.auditoriaAtual;

  if (!calculo) {
    uploadStatus.textContent = 'Faça um cálculo antes de gerar o relatório.';
    return;
  }
  if (!trct || !auditoria) {
    uploadStatus.textContent = 'Importe e compare o TRCT antes de gerar o PDF.';
    return;
  }

  try {
    const response = await fetch('/api/relatorio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calculo, trct, auditoria })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text.slice(0, 160) || 'Não foi possível gerar o PDF agora.');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'relatorio-conferencia-rescisao.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    uploadStatus.innerHTML = `<div class="status-warn">Falha ao gerar PDF: ${escapeHtml(error.message || 'erro desconhecido')}</div>`;
  }
});

limparAuditoriaBtn?.addEventListener('click', () => {
  trctImportado = null;
  auditoriaAtual = null;
  uploadForm.reset();
  uploadStatus.textContent = 'Nenhum arquivo importado.';
  window.AppState?.saveState?.({ trctImportado: null, auditoriaAtual: null });
  resetAuditoriaUI();
});

restoreSavedState();
