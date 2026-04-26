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
  const ecac = ecacImportado || state.ecacImportado || null;
  const ecacConferencia = ecacConferenciaAtual || state.ecacConferenciaAtual || null;
  const fgts = fgtsConferenciaAtual || state.fgtsConferenciaAtual || null;

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
      body: JSON.stringify({ calculo, trct, auditoria, ecac, ecacConferencia, fgts })
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

// =============================
// Conferência e-CAC / Fontes Pagadoras
// =============================
const ecacForm = document.getElementById('ecacForm');
const ecacStatus = document.getElementById('ecacStatus');
const ecacResumo = document.getElementById('ecacResumo');
const conferirEcacBtn = document.getElementById('conferirEcacBtn');
const limparEcacBtn = document.getElementById('limparEcacBtn');
const ecacVazia = document.getElementById('ecacVazia');
const ecacBox = document.getElementById('ecacBox');
const ecacFontes = document.getElementById('ecacFontes');
const ecacTabela = document.getElementById('ecacTabela');

let ecacImportado = null;
let ecacConferenciaAtual = null;

function formatNumber(value) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
}

function buildEcacStatus(data) {
  const lines = [];
  const arquivos = data.arquivos || [];

  if (data.lote) {
    lines.push(`Lote importado: <strong>${escapeHtml(data.quantidadeLidos || 0)}</strong> lido(s) de <strong>${escapeHtml(data.quantidadeArquivos || arquivos.length || 0)}</strong> arquivo(s).`);
    if (data.quantidadeComErro) {
      lines.push(`<div class="status-warn">${escapeHtml(data.quantidadeComErro)} arquivo(s) tiveram falha de leitura. Confira a lista abaixo.</div>`);
    }
  } else {
    lines.push(`Arquivo: <strong>${escapeHtml(data.arquivo?.nome || 'sem nome')}</strong>`);
  }

  lines.push(`Modelo: <strong>${escapeHtml(data.modelo?.modelLabel || 'e-CAC / Fontes Pagadoras')}</strong> (${formatPercent(data.modelo?.confidence || 0)})`);
  lines.push(`Ano-calendário: <strong>${escapeHtml(data.anoCalendario || 'não localizado')}</strong>`);

  if (data.beneficiario?.nome || data.beneficiario?.cpf) {
    lines.push(`Beneficiário: <strong>${escapeHtml([data.beneficiario?.cpf, data.beneficiario?.nome].filter(Boolean).join(' - '))}</strong>`);
  }

  if (String(data.estrategia || '').includes('ocr')) {
    lines.push('<div class="status-tip"><strong>OCR ativado em pelo menos um arquivo.</strong> Revise os totais lidos antes de usar como prova ou conferência.</div>');
  }

  (data.observacoes || []).slice(0, 5).forEach((obs) => lines.push(`<div>${escapeHtml(obs)}</div>`));
  return lines.join('<br>');
}

function renderEcacResumo(data) {
  if (!ecacResumo) return;
  const totais = data.totais || {};
  const indicadores = data.indicadores || {};
  ecacResumo.classList.remove('hidden');
  ecacResumo.innerHTML = `
    <div class="summary-item"><small>Rend. tributáveis</small><strong>${formatBRL(totais.rendimentoTributavel)}</strong></div>
    <div class="summary-item"><small>Prev. oficial</small><strong>${formatBRL(totais.previdenciaOficial)}</strong></div>
    <div class="summary-item"><small>IRRF</small><strong>${formatBRL(totais.impostoRetido)}</strong></div>
    <div class="summary-item"><small>13º/exclusiva</small><strong>${formatBRL(totais.decimoTerceiroRendimento)}</strong></div>
    <div class="summary-item"><small>IRRF 13º</small><strong>${formatBRL(totais.decimoTerceiroImpostoRetido)}</strong></div>
    <div class="summary-item"><small>Média mensal</small><strong>${formatBRL(indicadores.mediaMensalTributavel)}</strong></div>
  `;
}

function renderListaArquivosEcac(data) {
  const arquivos = data.arquivos || [];
  if (!arquivos.length) return '';

  return `
    <h3>Arquivos importados</h3>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Arquivo</th><th>Ano</th><th>Rend. tributáveis</th><th>Prev. oficial</th><th>IRRF</th><th>Status</th></tr></thead>
      <tbody>${arquivos.map((arquivo) => `
        <tr>
          <td>${escapeHtml(arquivo.nome)}</td>
          <td>${escapeHtml(arquivo.anoCalendario || '—')}</td>
          <td>${formatBRL(arquivo.totais?.rendimentoTributavel)}</td>
          <td>${formatBRL(arquivo.totais?.previdenciaOficial)}</td>
          <td>${formatBRL(arquivo.totais?.impostoRetido)}</td>
          <td><span class="badge ${arquivo.ok ? 'ok' : 'danger'}">${arquivo.ok ? 'LIDO' : 'ERRO'}</span></td>
        </tr>`).join('')}</tbody>
    </table></div>
  `;
}

function renderEcacDados(data, conferencia = null) {
  if (!ecacBox || !ecacVazia) return;
  ecacVazia.classList.add('hidden');
  ecacBox.classList.remove('hidden');

  const fontes = data.fontesPagadoras || [];
  ecacFontes.innerHTML = `
    <div class="report-note">
      <strong>Fontes pagadoras localizadas:</strong><br>
      ${fontes.length ? fontes.map((f) => `${escapeHtml(f.cnpj)} — ${escapeHtml(f.nome || 'nome não lido')}`).join('<br>') : 'Nenhuma fonte pagadora localizada automaticamente.'}
    </div>
  `;

  const totais = data.totais || {};
  const codigos = data.codigosReceita || [];
  const conferenciaRows = conferencia?.linhas || [];
  const avisos = conferencia?.avisos || [];

  ecacTabela.innerHTML = `
    ${renderListaArquivosEcac(data)}

    <h3>Total consolidado</h3>
    <table class="table">
      <thead><tr><th>Campo e-CAC</th><th>Valor</th></tr></thead>
      <tbody>
        <tr><td>Ano-calendário</td><td>${escapeHtml(data.anoCalendario || '—')}</td></tr>
        <tr><td>Rendimentos tributáveis</td><td>${formatBRL(totais.rendimentoTributavel)}</td></tr>
        <tr><td>Previdência oficial</td><td>${formatBRL(totais.previdenciaOficial)}</td></tr>
        <tr><td>IRRF</td><td>${formatBRL(totais.impostoRetido)}</td></tr>
        <tr><td>Rendimento isento/sem retenção</td><td>${formatBRL(totais.rendimentoIsentoSemRetencao)}</td></tr>
        <tr><td>13º / tributação exclusiva</td><td>${formatBRL(totais.decimoTerceiroRendimento)}</td></tr>
        <tr><td>IRRF 13º</td><td>${formatBRL(totais.decimoTerceiroImpostoRetido)}</td></tr>
        <tr><td>Total com 13º</td><td>${formatBRL(data.indicadores?.rendimentoTotalCom13)}</td></tr>
      </tbody>
    </table>

    ${codigos.length ? `
      <h3>Códigos de receita lidos</h3>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Arquivo</th><th>Código</th><th>Rendimento</th><th>Prev. oficial</th><th>IRRF provável</th></tr></thead>
        <tbody>${codigos.map((item) => `
          <tr>
            <td>${escapeHtml(item.arquivo || '—')}</td>
            <td>${escapeHtml(item.codigo)}</td>
            <td>${formatBRL(item.rendimento)}</td>
            <td>${formatBRL(item.previdenciaOficial)}</td>
            <td>${formatBRL(item.impostoRetido)}</td>
          </tr>`).join('')}</tbody>
      </table></div>` : ''}

    ${conferenciaRows.length ? `
      <h3>Conferência contra cálculo salvo</h3>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Item</th><th>Sistema</th><th>e-CAC</th><th>Diferença</th><th>Status</th></tr></thead>
        <tbody>${conferenciaRows.map((item) => `
          <tr>
            <td>${escapeHtml(item.item)}</td>
            <td>${formatBRL(item.sistema)}</td>
            <td>${formatBRL(item.ecac)}</td>
            <td>${formatBRL(item.diferenca)}</td>
            <td><span class="badge ${item.status === 'OK' ? 'ok' : item.status === 'ALERTA' ? 'danger' : item.status === 'NAO_LIDO' ? 'warn' : 'info'}">${escapeHtml(item.status)}</span></td>
          </tr>`).join('')}</tbody>
      </table></div>` : ''}

    ${avisos.length ? `<div class="alert-list">${avisos.map((aviso) => `<div class="alert">${escapeHtml(aviso)}</div>`).join('')}</div>` : ''}
  `;
}

function restoreEcacState() {
  const state = window.AppState?.loadState?.() || {};
  if (state.ecacImportado) {
    ecacImportado = state.ecacImportado;
    ecacConferenciaAtual = state.ecacConferenciaAtual || null;
    if (ecacStatus) ecacStatus.innerHTML = buildEcacStatus(ecacImportado);
    renderEcacResumo(ecacImportado);
    renderEcacDados(ecacImportado, ecacConferenciaAtual);
  }
}


async function conferirEcacAutomatico(modo = 'manual') {
  const state = window.AppState?.loadState?.() || {};
  const ultimoCalculo = state.calculo || JSON.parse(localStorage.getItem('ultimoCalculoRescisao') || 'null');

  if (!ecacImportado) {
    if (ecacStatus) ecacStatus.textContent = 'Importe um ou mais informes e-CAC antes de conferir.';
    return null;
  }

  if (!ultimoCalculo) {
    if (ecacStatus && modo === 'auto') {
      ecacStatus.innerHTML += '<br><div class="status-warn">e-CAC importado. Faça ou carregue o cálculo da rescisão para comparar automaticamente.</div>';
    }
    return null;
  }

  try {
    if (ecacStatus && modo === 'auto') {
      ecacStatus.innerHTML += '<br><strong>Comparando automaticamente com o último cálculo salvo...</strong>';
    }

    const response = await fetch('/api/ecac/conferir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calculado: ultimoCalculo, informe: ecacImportado })
    });
    const data = await parseApiResponse(response);
    if (!response.ok || data.ok === false) throw new Error(data.error || 'Falha ao conferir e-CAC.');

    ecacConferenciaAtual = data;
    window.AppState?.saveState?.({ ecacImportado, ecacConferenciaAtual: data });
    renderEcacDados(ecacImportado, data);

    if (ecacStatus) {
      const resumo = data.resumo || {};
      ecacStatus.innerHTML += `<br><div class="status-tip"><strong>Comparação automática concluída.</strong> OK: ${escapeHtml(resumo.ok || 0)} | Divergências: ${escapeHtml(resumo.alertas || 0)} | Informativos: ${escapeHtml(resumo.informativos || 0)} | Não lidos: ${escapeHtml(resumo.naoLidos || 0)}</div>`;
    }
    return data;
  } catch (error) {
    if (ecacStatus) ecacStatus.innerHTML += `<br><div class="status-warn">Falha na comparação automática e-CAC: ${escapeHtml(error.message || 'erro desconhecido')}</div>`;
    return null;
  }
}

ecacForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.getElementById('arquivoECAC');
  const arquivos = Array.from(input?.files || []);
  if (!arquivos.length) {
    ecacStatus.innerHTML = '<div class="status-warn">Selecione um ou mais PDFs/imagens do e-CAC antes de importar.</div>';
    return;
  }

  const formData = new FormData();
  arquivos.forEach((arquivo) => formData.append('arquivos', arquivo));
  ecacStatus.innerHTML = `Importando ${arquivos.length} arquivo(s) do e-CAC...`;

  try {
    const response = await fetch('/api/ecac/importar-lote', { method: 'POST', body: formData });
    const data = await parseApiResponse(response);
    if (!response.ok && !data?.quantidadeLidos) throw new Error(data.error || 'Falha ao importar informe e-CAC.');

    ecacImportado = data;
    ecacConferenciaAtual = null;
    window.AppState?.saveState?.({ ecacImportado: data, ecacConferenciaAtual: null });
    ecacStatus.innerHTML = buildEcacStatus(data);
    renderEcacResumo(data);
    renderEcacDados(data);
    await conferirEcacAutomatico('auto');
  } catch (error) {
    ecacStatus.innerHTML = `<div class="status-warn">Falha ao importar e-CAC: ${escapeHtml(error.message || 'erro desconhecido')}</div>`;
  }
});

conferirEcacBtn?.addEventListener('click', async () => {
  await conferirEcacAutomatico('manual');
});

limparEcacBtn?.addEventListener('click', () => {
  ecacImportado = null;
  ecacConferenciaAtual = null;
  ecacForm?.reset();
  if (ecacStatus) ecacStatus.textContent = 'Nenhum informe e-CAC importado.';
  ecacResumo?.classList.add('hidden');
  if (ecacResumo) ecacResumo.innerHTML = '';
  if (ecacTabela) ecacTabela.innerHTML = '';
  if (ecacFontes) ecacFontes.innerHTML = '';
  ecacBox?.classList.add('hidden');
  ecacVazia?.classList.remove('hidden');
  window.AppState?.saveState?.({ ecacImportado: null, ecacConferenciaAtual: null });
});

// ===== FGTS / CAIXA =====
const fgtsForm = document.getElementById('fgtsForm');
const arquivoFGTS = document.getElementById('arquivoFGTS');
const saldoFgtsManual = document.getElementById('saldoFgtsManual');
const conferirFgtsBtn = document.getElementById('conferirFgtsBtn');
const limparFgtsBtn = document.getElementById('limparFgtsBtn');
const fgtsStatus = document.getElementById('fgtsStatus');
const fgtsResumo = document.getElementById('fgtsResumo');
const fgtsVazia = document.getElementById('fgtsVazia');
const fgtsBox = document.getElementById('fgtsBox');
const fgtsTabela = document.getElementById('fgtsTabela');

let fgtsImportado = null;
let fgtsConferenciaAtual = null;

function parseMoneyBR(value) {
  if (value === null || value === undefined) return null;
  let s = String(value).trim();
  if (!s) return null;
  s = s.replace(/[^\d,.-]/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma) s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function deepFindNumber(obj, keys) {
  const wanted = keys.map((k) => String(k).toLowerCase());
  const seen = new Set();
  function walk(node) {
    if (!node || typeof node !== 'object' || seen.has(node)) return null;
    seen.add(node);
    for (const [key, value] of Object.entries(node)) {
      const low = key.toLowerCase();
      if (wanted.some((k) => low === k || low.includes(k))) {
        const n = parseMoneyBR(value);
        if (n !== null) return n;
      }
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') {
        const found = walk(value);
        if (found !== null) return found;
      }
    }
    return null;
  }
  return walk(obj);
}

function getMultaFgtsSistema(calculo) {
  return deepFindNumber(calculo, ['multafgts', 'multafgts40', 'multa do fgts', 'multa fgts', 'fgts40', 'fgts']) ?? 0;
}

function montarConferenciaFGTS(saldo, origem = 'manual', extra = {}) {
  const state = window.AppState?.loadState?.() || {};
  const calculo = state.calculo || JSON.parse(localStorage.getItem('ultimoCalculoRescisao') || 'null') || {};
  const multaSistema = getMultaFgtsSistema(calculo);
  const multaEsperada = saldo === null ? null : Math.round(saldo * 0.4 * 100) / 100;
  const diferenca = multaEsperada === null ? null : Math.round((multaSistema - multaEsperada) * 100) / 100;
  const status = diferenca === null ? 'NAO_LIDO' : Math.abs(diferenca) <= 1 ? 'OK' : 'DIVERGENTE';

  return {
    origem,
    ...extra,
    saldo,
    multaEsperada,
    multaSistema,
    diferenca,
    status,
    linhas: [
      { item: 'Saldo FGTS informado/importado', sistema: null, fgts: saldo, diferenca: null, status: saldo === null ? 'NAO_LIDO' : 'INFORMATIVO' },
      { item: 'Multa 40% esperada sobre saldo FGTS', sistema: multaSistema, fgts: multaEsperada, diferenca, status },
      { item: 'Multa FGTS do TRCT/sistema', sistema: multaSistema, fgts: null, diferenca: null, status: multaSistema ? 'INFORMATIVO' : 'NAO_LIDO' }
    ],
    avisos: multaSistema ? [] : ['A multa FGTS do sistema não foi localizada no último cálculo salvo. Confira se o cálculo foi feito antes da conferência.']
  };
}

function renderFGTS(data) {
  fgtsConferenciaAtual = data;
  if (fgtsResumo) {
    fgtsResumo.classList.remove('hidden');
    fgtsResumo.innerHTML = `
      <div class="summary-item"><small>Saldo FGTS</small><strong>${formatBRL(data.saldo)}</strong></div>
      <div class="summary-item"><small>Multa 40% esperada</small><strong>${formatBRL(data.multaEsperada)}</strong></div>
      <div class="summary-item"><small>Multa sistema/TRCT</small><strong>${formatBRL(data.multaSistema)}</strong></div>
      <div class="summary-item"><small>Diferença</small><strong>${formatBRL(data.diferenca)}</strong></div>
      <div class="summary-item"><small>Status</small><strong>${escapeHtml(data.status)}</strong></div>
    `;
  }

  if (fgtsVazia) fgtsVazia.classList.add('hidden');
  if (fgtsBox) fgtsBox.classList.remove('hidden');
  if (fgtsTabela) {
    fgtsTabela.innerHTML = `
      <div class="report-note">
        <strong>Origem:</strong> ${escapeHtml(data.origem || 'manual')}
        ${data.arquivo?.nome ? `<br><strong>Arquivo:</strong> ${escapeHtml(data.arquivo.nome)}` : ''}
        ${data.encontradoPor ? `<br><strong>Leitura:</strong> ${escapeHtml(data.encontradoPor)}` : ''}
      </div>
      <table class="table">
        <thead><tr><th>Item</th><th>Sistema/TRCT</th><th>FGTS/Caixa</th><th>Diferença</th><th>Status</th></tr></thead>
        <tbody>${(data.linhas || []).map((item) => `
          <tr>
            <td>${escapeHtml(item.item)}</td>
            <td>${formatBRL(item.sistema)}</td>
            <td>${formatBRL(item.fgts)}</td>
            <td>${formatBRL(item.diferenca)}</td>
            <td><span class="badge ${item.status === 'OK' ? 'ok' : item.status === 'DIVERGENTE' ? 'danger' : item.status === 'NAO_LIDO' ? 'warn' : 'info'}">${escapeHtml(item.status)}</span></td>
          </tr>`).join('')}</tbody>
      </table>
      ${(data.avisos || []).length ? `<div class="alert-list">${data.avisos.map((a) => `<div class="alert">${escapeHtml(a)}</div>`).join('')}</div>` : ''}
    `;
  }

  window.AppState?.saveState?.({ fgtsConferenciaAtual: data });
}

function restoreFgtsState() {
  const state = window.AppState?.loadState?.() || {};
  if (state.fgtsConferenciaAtual) {
    fgtsConferenciaAtual = state.fgtsConferenciaAtual;
    if (fgtsStatus) fgtsStatus.innerHTML = 'FGTS restaurado do último estado salvo.';
    renderFGTS(fgtsConferenciaAtual);
  }
}

fgtsForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const arquivo = arquivoFGTS?.files?.[0];
  if (!arquivo) {
    if (fgtsStatus) fgtsStatus.innerHTML = '<div class="status-warn">Selecione um PDF ou imagem do FGTS, ou informe o saldo manualmente.</div>';
    return;
  }

  if (fgtsStatus) fgtsStatus.textContent = 'Importando extrato FGTS...';
  const formData = new FormData();
  formData.append('arquivo', arquivo);

  try {
    const response = await fetch('/api/fgts/importar', { method: 'POST', body: formData });
    const data = await parseApiResponse(response);
    if (!response.ok || data.ok === false || data.saldo === null) {
      throw new Error(data.error || data.observacoes?.join(' ') || 'Saldo FGTS não localizado automaticamente.');
    }

    fgtsImportado = data;
    const conferencia = montarConferenciaFGTS(Number(data.saldo), 'importado', data);
    if (saldoFgtsManual) saldoFgtsManual.value = String(data.saldo).replace('.', ',');
    if (fgtsStatus) fgtsStatus.innerHTML = `FGTS importado: <strong>${escapeHtml(data.arquivo?.nome || arquivo.name)}</strong>`;
    renderFGTS(conferencia);
  } catch (error) {
    if (fgtsStatus) fgtsStatus.innerHTML = `<div class="status-warn">Falha ao importar FGTS: ${escapeHtml(error.message || 'erro desconhecido')}<br>Informe o saldo manualmente e clique em Conferir FGTS.</div>`;
  }
});

conferirFgtsBtn?.addEventListener('click', () => {
  const saldo = parseMoneyBR(saldoFgtsManual?.value);
  if (saldo === null) {
    if (fgtsStatus) fgtsStatus.innerHTML = '<div class="status-warn">Informe o saldo FGTS no campo manual ou importe um extrato legível.</div>';
    return;
  }
  if (fgtsStatus) fgtsStatus.innerHTML = 'Conferência FGTS calculada manualmente.';
  renderFGTS(montarConferenciaFGTS(saldo, 'manual'));
});

limparFgtsBtn?.addEventListener('click', () => {
  fgtsImportado = null;
  fgtsConferenciaAtual = null;
  fgtsForm?.reset();
  if (saldoFgtsManual) saldoFgtsManual.value = '';
  if (fgtsStatus) fgtsStatus.textContent = 'Nenhum saldo FGTS informado/importado.';
  fgtsResumo?.classList.add('hidden');
  if (fgtsResumo) fgtsResumo.innerHTML = '';
  if (fgtsTabela) fgtsTabela.innerHTML = '';
  fgtsBox?.classList.add('hidden');
  fgtsVazia?.classList.remove('hidden');
  window.AppState?.saveState?.({ fgtsConferenciaAtual: null });
});

restoreEcacState();
restoreFgtsState();
