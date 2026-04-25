function brlToNumber(str = '') {
  const raw = String(str).trim();
  if (!raw || /a\s*apurar/i.test(raw)) return null;

  const cleaned = raw
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalizeSpaces(str = '') {
  return String(str)
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function normalizeForMatch(str = '') {
  return normalizeSpaces(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parseLines(text = '') {
  return String(text)
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => normalizeSpaces(line))
    .filter(Boolean);
}

function scoreToLabel(score) {
  if (score >= 0.9) return 'alta';
  if (score >= 0.7) return 'média';
  return 'baixa';
}

function buildField(value, confidence = 0, source = 'nao-encontrado') {
  return {
    value: value ?? null,
    confidence,
    confidenceLabel: scoreToLabel(confidence),
    source,
    found: value !== null && value !== undefined && value !== ''
  };
}

function findLineIndex(lines, matcher) {
  const predicate = typeof matcher === 'function'
    ? matcher
    : (line) => normalizeForMatch(line).includes(normalizeForMatch(matcher));
  return lines.findIndex(predicate);
}

function moneyFromLine(line = '') {
  if (/a\s*apurar/i.test(line)) return { value: null, special: 'a_apurar' };
  const match = line.match(/R\$\s*([\d\.,]+)/i);
  return { value: match ? brlToNumber(match[1]) : null, special: null };
}

function findMoneyNearLine(lines, idx, lookahead = 4) {
  if (idx < 0) return buildField(null, 0, 'label-ausente');

  for (let offset = 0; offset <= lookahead; offset += 1) {
    const line = lines[idx + offset];
    if (!line) break;
    const parsed = moneyFromLine(line);
    if (parsed.special === 'a_apurar') {
      return buildField(null, 0.98 - offset * 0.05, offset === 0 ? 'mesma-linha-a-apurar' : 'proximas-linhas-a-apurar');
    }
    if (parsed.value !== null) {
      return buildField(parsed.value, offset === 0 ? 0.96 : Math.max(0.72, 0.9 - offset * 0.06), offset === 0 ? 'mesma-linha' : 'proximas-linhas');
    }
  }

  return buildField(null, 0, 'valor-nao-encontrado');
}

function findDateNearLine(lines, idx, lookahead = 2) {
  if (idx < 0) return buildField(null, 0, 'label-ausente');

  for (let offset = 0; offset <= lookahead; offset += 1) {
    const line = lines[idx + offset];
    if (!line) break;
    const match = line.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (match) {
      return buildField(match[1], offset === 0 ? 0.95 : Math.max(0.74, 0.88 - offset * 0.06), offset === 0 ? 'mesma-linha' : 'proximas-linhas');
    }
  }

  return buildField(null, 0, 'valor-nao-encontrado');
}

function extractHeaderFromCombinedLine(lines) {
  const headerLine = lines.find((line) => {
    const n = normalizeForMatch(line);
    return n.includes('admissao') && n.includes('desligamento');
  }) || '';

  const motivoLine = lines.find((line) => {
    const n = normalizeForMatch(line);
    return n.includes('motivo') && n.includes('aviso previo');
  }) || '';

  const salarioLine = lines.find((line) => normalizeForMatch(line).includes('salario base final')) || '';

  const dataAdmissao = headerLine.match(/admiss[aã]o\s*(\d{2}\/\d{2}\/\d{4})/i);
  const dataDesligamento = headerLine.match(/desligamento\s*(\d{2}\/\d{2}\/\d{4})/i);
  const motivo = motivoLine.match(/motivo\s*(.+?)\s*aviso pr[eé]vio/i);
  const avisoInfo = motivoLine.match(/aviso pr[eé]vio\s*(.+)$/i);
  const salarioBase = salarioLine.match(/sal[aá]rio base final\s*R\$\s*([\d\.,]+)/i);

  return {
    dataAdmissao: dataAdmissao ? buildField(dataAdmissao[1], 0.97, 'linha-combinada') : null,
    dataDesligamento: dataDesligamento ? buildField(dataDesligamento[1], 0.97, 'linha-combinada') : null,
    motivo: motivo ? buildField(normalizeSpaces(motivo[1]), 0.93, 'linha-combinada') : null,
    avisoInfo: avisoInfo ? buildField(normalizeSpaces(avisoInfo[1]), 0.92, 'linha-combinada') : null,
    salarioBase: salarioBase ? buildField(brlToNumber(salarioBase[1]), 0.96, 'linha-combinada') : null
  };
}

function extractHeaderFromLabeledRows(lines) {
  return {
    dataAdmissao: findDateNearLine(lines, findLineIndex(lines, 'admissao'), 2),
    dataDesligamento: findDateNearLine(lines, findLineIndex(lines, 'desligamento'), 2),
    salarioBase: findMoneyNearLine(lines, findLineIndex(lines, 'salario base final'), 2),
    motivo: (() => {
      const idx = findLineIndex(lines, 'motivo');
      if (idx < 0) return buildField(null, 0, 'label-ausente');
      const line = lines[idx];
      const direct = line.replace(/^motivo\s*/i, '').trim();
      if (direct && normalizeForMatch(direct) !== 'motivo') return buildField(direct, 0.85, 'mesma-linha');
      const next = lines[idx + 1];
      return next ? buildField(next, 0.75, 'proxima-linha') : buildField(null, 0, 'valor-nao-encontrado');
    })(),
    avisoInfo: (() => {
      const idx = findLineIndex(lines, 'aviso previo');
      if (idx < 0) return buildField(null, 0, 'label-ausente');
      const line = lines[idx];
      const direct = line.replace(/^aviso pr[eé]vio\s*/i, '').trim();
      if (direct && !/^aviso pr[eé]vio$/i.test(direct)) return buildField(direct, 0.84, 'mesma-linha');
      const next = lines[idx + 1];
      return next ? buildField(next, 0.74, 'proxima-linha') : buildField(null, 0, 'valor-nao-encontrado');
    })()
  };
}

function findRubrica(lines, aliases) {
  const idx = findLineIndex(lines, (line) => {
    const normalized = normalizeForMatch(line);
    return aliases.some((alias) => normalized.includes(normalizeForMatch(alias)));
  });
  return findMoneyNearLine(lines, idx, 5);
}

function detectModel(lines, strategy) {
  const joined = normalizeForMatch(lines.join(' '));
  const hasCodigoDescricao = joined.includes('codigo') && joined.includes('descricao') && joined.includes('referencia') && joined.includes('valor');
  const hasResumo = joined.includes('resumo financeiro');
  const hasHeader = joined.includes('termo de rescisao do contrato de trabalho');
  const hasLabeledRows = ['admissao', 'desligamento', 'motivo', 'aviso previo', 'salario base final']
    .filter((label) => joined.includes(label)).length;

  if (hasHeader && hasCodigoDescricao && hasResumo) {
    return {
      modelId: strategy === 'ocr' ? 'TRCT_PADRAO_TABELADO_OCR' : 'TRCT_PADRAO_TABELADO_PDF',
      modelLabel: strategy === 'ocr' ? 'TRCT padrão tabelado via OCR' : 'TRCT padrão tabelado com texto nativo',
      confidence: strategy === 'ocr' ? 0.9 : 0.97
    };
  }

  if (hasHeader && hasLabeledRows >= 4) {
    return {
      modelId: 'TRCT_CABECALHO_ROTULADO',
      modelLabel: 'TRCT com cabeçalho rotulado e verbas em linhas',
      confidence: 0.78
    };
  }

  return {
    modelId: 'TRCT_GENERIC_OCR',
    modelLabel: 'TRCT genérico / baixa estrutura detectada',
    confidence: 0.55
  };
}

function chooseBetterField(primary, fallback) {
  if (primary && primary.found) return primary;
  return fallback || buildField(null, 0, 'nao-encontrado');
}

function summarizeConfidence(fieldMap) {
  const scores = Object.values(fieldMap)
    .map((field) => field?.confidence || 0)
    .filter((n) => Number.isFinite(n));

  if (!scores.length) return { average: 0, label: 'baixa' };

  const average = scores.reduce((sum, n) => sum + n, 0) / scores.length;
  return {
    average: Number(average.toFixed(2)),
    label: scoreToLabel(average)
  };
}

function normalizeTRCT(parsed) {
  const textoBruto = String(parsed?.textoBruto || '');
  const lines = parseLines(textoBruto);
  const strategy = parsed?.estrategia || 'texto-nativo';
  const model = detectModel(lines, strategy);

  const headerCombined = extractHeaderFromCombinedLine(lines);
  const headerLabeled = extractHeaderFromLabeledRows(lines);

  const camposDetalhados = {
    dataAdmissao: chooseBetterField(headerCombined.dataAdmissao, headerLabeled.dataAdmissao),
    dataDesligamento: chooseBetterField(headerCombined.dataDesligamento, headerLabeled.dataDesligamento),
    salarioBase: chooseBetterField(headerCombined.salarioBase, headerLabeled.salarioBase),
    motivo: chooseBetterField(headerCombined.motivo, headerLabeled.motivo),
    avisoInfo: chooseBetterField(headerCombined.avisoInfo, headerLabeled.avisoInfo),
    saldoSalario: findRubrica(lines, ['saldo de salario', 'saldo salario']),
    avisoPrevio: findRubrica(lines, ['aviso previo indenizado', 'aviso prévio indenizado']),
    feriasVencidas: findRubrica(lines, ['ferias vencidas + 1/3', 'férias vencidas + 1/3']),
    feriasProporcionais: findRubrica(lines, ['ferias proporcionais + 1/3', 'férias proporcionais + 1/3']),
    decimoTerceiro: findRubrica(lines, ['13o salario proporcional', '13º salario proporcional', '13o salário proporcional', '13° salario proporcional']),
    totalBruto: findMoneyNearLine(lines, findLineIndex(lines, 'total bruto'), 3),
    totalDescontos: findMoneyNearLine(lines, findLineIndex(lines, 'descontos'), 3),
    liquido: findMoneyNearLine(lines, findLineIndex(lines, 'liquido estimado'), 3),
    multaFgts: findRubrica(lines, ['multa fgts', 'indenizacao compensatoria 40%', 'indenização compensatória 40%'])
  };

  const campos = Object.fromEntries(
    Object.entries(camposDetalhados).map(([key, field]) => [key, field.value])
  );

  const confianca = summarizeConfidence(camposDetalhados);

  return {
    origem: parsed?.tipoEntrada || 'desconhecida',
    estrategia: strategy,
    observacoes: parsed?.observacoes || [],
    textoBruto,
    linhas: lines,
    model,
    confidence: confianca,
    campos,
    camposDetalhados
  };
}

module.exports = { normalizeTRCT };
