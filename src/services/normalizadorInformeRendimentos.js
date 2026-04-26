function normalizeSpaces(str = '') {
  return String(str).replace(/\u00A0/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

function normalizeForMatch(str = '') {
  return normalizeSpaces(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function parseLines(text = '') {
  return String(text).replace(/\r/g, '').split('\n').map(normalizeSpaces).filter(Boolean);
}

function brlToNumber(str = '') {
  const cleaned = String(str || '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function roundMoney(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function moneyTokens(line = '') {
  const matches = String(line).match(/(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}/g) || [];
  return matches.map(brlToNumber).filter((n) => n !== null);
}

function firstRegex(text, regex, group = 1) {
  const match = String(text || '').match(regex);
  return match ? normalizeSpaces(match[group] || '') : null;
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractSection(text, startRegex, endRegexes = []) {
  const source = String(text || '');
  const startMatch = source.match(startRegex);
  if (!startMatch || startMatch.index === undefined) return '';
  const rest = source.slice(startMatch.index);
  let end = rest.length;
  endRegexes.forEach((regex) => {
    const match = rest.match(regex);
    if (match && match.index !== undefined && match.index > 0) end = Math.min(end, match.index);
  });
  return rest.slice(0, end);
}

function findLastTotalNumbers(sectionText = '', minNumbers = 1) {
  const lines = parseLines(sectionText);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    const normalized = normalizeForMatch(line);
    if (/^total\b/i.test(line) || normalized.includes(' total ')) {
      const nums = moneyTokens(line);
      if (nums.length >= minNumbers) return nums;
    }
  }
  const all = moneyTokens(sectionText);
  return all.length >= minNumbers ? all.slice(-Math.max(minNumbers, Math.min(all.length, 8))) : [];
}

function extractBeneficiario(text = '') {
  const direct = String(text).match(/Benefici[aá]rio:\s*([\d.-]+)\s*-\s*([^\n]+)/i);
  if (direct) return { cpf: normalizeSpaces(direct[1]), nome: normalizeSpaces(direct[2]) };
  const cpf = firstRegex(text, /(\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})/i);
  return { cpf, nome: null };
}

function extractFontesPagadoras(lines = []) {
  const cnpjRegex = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;
  const fontes = [];
  lines.forEach((line, index) => {
    const cnpjs = line.match(cnpjRegex) || [];
    cnpjs.forEach((cnpj) => {
      let nome = normalizeSpaces(line.replace(cnpj, '').replace(/\d{2}\/\d{2}\/\d{4}/g, '').replace(/Fonte Pagadora|CNPJ\/CPF|Nome Empresarial\/Nome|Data do Processamento/gi, ''));
      if (!nome || moneyTokens(nome).length) {
        const candidates = [lines[index + 1], lines[index + 2], lines[index - 1]];
        nome = candidates.map((c) => normalizeSpaces(c || '')).find((candidate) => {
          const n = normalizeForMatch(candidate);
          return candidate && !(candidate.match(cnpjRegex) || []).length && !n.includes('data do processamento') && !n.includes('total') && !moneyTokens(candidate).length;
        }) || null;
      }
      fontes.push({ cnpj, nome });
    });
  });
  return uniqueBy(fontes, (item) => item.cnpj);
}

function extractCodigosReceita(lines = []) {
  const codigosValidos = new Set(['0561', '0588', '1889', '1895', '3208', '3223', '3277', '3533', '3540', '3556', '3562', '5204', '5928', '5936', '6891', '6904', '9385']);
  const itens = [];
  lines.forEach((line) => {
    const code = (line.match(/\b\d{4}\b/g) || []).find((item) => codigosValidos.has(item));
    if (!code) return;
    const nums = moneyTokens(line);
    if (!nums.length) return;
    itens.push({
      codigo: code,
      valores: nums,
      rendimento: nums[0] ?? null,
      previdenciaOficial: nums[1] ?? null,
      impostoRetido: nums.length >= 7 ? nums[6] : nums[nums.length - 1],
      linha: line
    });
  });
  return itens;
}

function normalizeInformeRendimentos(parsed = {}) {
  const textoBruto = String(parsed.textoBruto || '');
  const lines = parseLines(textoBruto);
  const joined = lines.join('\n');
  const normalizedJoined = normalizeForMatch(joined);

  const anoCalendario = firstRegex(joined, /ano-calend[aá]rio\s+(\d{4})/i)
    || firstRegex(joined, /ano calendario\s+(\d{4})/i)
    || firstRegex(joined, /calend[aá]rio\s+(\d{4})/i);

  const tributaveisSection = extractSection(joined, /Rendimentos\s+tribut[aá]veis/i, [
    /Rendimentos\s+sujeitos\s+[aà]\s+tributa[cç][aã]o\s+exclusiva/i,
    /Esta consulta apresenta/i
  ]);
  const exclusivaSection = extractSection(joined, /Rendimentos\s+sujeitos\s+[aà]\s+tributa[cç][aã]o\s+exclusiva/i, [
    /Esta consulta apresenta/i,
    /O valor do 13/i,
    /Verificada qualquer/i
  ]);

  const tribNums = findLastTotalNumbers(tributaveisSection, 3);
  const exclNums = findLastTotalNumbers(exclusivaSection, 1);
  const totais = {
    rendimentoTributavel: tribNums[0] ?? null,
    previdenciaOficial: tribNums[1] ?? null,
    dependente: tribNums[2] ?? null,
    pensaoAlimenticia: tribNums[3] ?? null,
    previdenciaPrivadaFapi: tribNums[4] ?? null,
    deducoesTotal: tribNums[5] ?? null,
    impostoRetido: tribNums[6] ?? null,
    rendimentoIsentoSemRetencao: tribNums[7] ?? null,
    decimoTerceiroRendimento: exclNums[0] ?? null,
    decimoTerceiroImpostoRetido: exclNums[1] ?? null
  };

  const fontePagadoras = extractFontesPagadoras(lines);
  const codigosReceita = extractCodigosReceita(lines);
  const dataProcessamento = firstRegex(joined, /(\d{2}\/\d{2}\/\d{4})/i);
  const beneficiario = extractBeneficiario(joined);
  const mediaMensalTributavel = totais.rendimentoTributavel === null ? null : roundMoney(totais.rendimentoTributavel / 12);

  const confidence = Math.min(0.99, roundMoney([
    normalizedJoined.includes('fontes pagadoras') ? 0.2 : 0,
    normalizedJoined.includes('rendimentos tributaveis') ? 0.25 : 0,
    normalizedJoined.includes('tributacao exclusiva') ? 0.15 : 0,
    anoCalendario ? 0.15 : 0,
    totais.rendimentoTributavel !== null ? 0.15 : 0,
    fontePagadoras.length ? 0.1 : 0
  ].reduce((sum, item) => sum + item, 0)));

  return {
    origem: parsed.tipoEntrada || 'desconhecida',
    estrategia: parsed.estrategia || 'texto-nativo',
    observacoes: parsed.observacoes || [],
    textoBruto,
    linhas: lines,
    modelo: {
      modelId: 'ECAC_FONTES_PAGADORAS',
      modelLabel: 'e-CAC / Fontes Pagadoras - Informe de Rendimentos',
      confidence
    },
    beneficiario,
    anoCalendario,
    dataProcessamento,
    fontesPagadoras: fontePagadoras,
    codigosReceita,
    totais,
    indicadores: {
      mediaMensalTributavel,
      totalRetencoes: roundMoney((totais.previdenciaOficial || 0) + (totais.impostoRetido || 0) + (totais.decimoTerceiroImpostoRetido || 0)),
      rendimentoTotalCom13: roundMoney((totais.rendimentoTributavel || 0) + (totais.decimoTerceiroRendimento || 0))
    }
  };
}

module.exports = {
  normalizeInformeRendimentos,
  brlToNumber,
  moneyTokens,
  normalizeForMatch,
  parseLines
};
