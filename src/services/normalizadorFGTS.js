'use strict';

function parseBRNumber(value) {
  if (value === null || value === undefined) return null;
  let s = String(value).trim();
  if (!s) return null;
  s = s.replace(/[^\d,.-]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    s = s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function moneyPattern() {
  return /(?:R\$\s*)?([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2}|[0-9]+,[0-9]{2}|[0-9]+(?:\.[0-9]{2})?)/i;
}

function normalizeText(text = '') {
  return String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickBestSaldo(text = '') {
  const raw = String(text || '');
  const norm = normalizeText(raw);
  const candidates = [];

  const rules = [
    { label: 'Valor para fins rescisórios', score: 100, re: new RegExp(`(?:valor\\s+para\\s+fins\\s+rescisorios|fins\\s+rescisorios)[^0-9]{0,80}${moneyPattern().source}`, 'ig') },
    { label: 'Saldo para fins rescisórios', score: 95, re: new RegExp(`(?:saldo\\s+para\\s+fins\\s+rescisorios)[^0-9]{0,80}${moneyPattern().source}`, 'ig') },
    { label: 'Saldo atual FGTS', score: 80, re: new RegExp(`(?:saldo\\s+atual|saldo\\s+fgts|saldo\\s+disponivel|saldo\\s+total)[^0-9]{0,80}${moneyPattern().source}`, 'ig') },
    { label: 'Total do extrato', score: 70, re: new RegExp(`(?:total|saldo)[^0-9]{0,80}${moneyPattern().source}`, 'ig') }
  ];

  for (const rule of rules) {
    let m;
    while ((m = rule.re.exec(norm)) !== null) {
      const value = parseBRNumber(m[1]);
      if (value !== null) candidates.push({ value, label: rule.label, score: rule.score, trecho: m[0].slice(0, 120) });
    }
  }

  // Fallback: maior valor monetário encontrado no documento, útil para prints simples do saldo.
  const allMoney = [...norm.matchAll(new RegExp(moneyPattern().source, 'ig'))]
    .map((m) => parseBRNumber(m[1]))
    .filter((v) => v !== null && v > 0);
  if (allMoney.length) {
    const max = Math.max(...allMoney);
    candidates.push({ value: max, label: 'Maior valor monetário localizado', score: 45, trecho: 'fallback-maior-valor' });
  }

  candidates.sort((a, b) => (b.score - a.score) || (b.value - a.value));
  return candidates[0] || null;
}

function normalizeFGTS(parsed = {}, file = {}) {
  const text = parsed.textoBruto || parsed.text || '';
  const found = pickBestSaldo(text);
  const saldo = found ? found.value : null;
  const multaEsperada = saldo === null ? null : Math.round(saldo * 0.4 * 100) / 100;

  return {
    ok: saldo !== null,
    arquivo: {
      nome: file.originalname || file.nome || 'extrato-fgts',
      tipo: file.mimetype || file.tipo || parsed.tipoEntrada || null,
      tamanho: file.size || file.tamanho || null
    },
    origem: 'importado',
    estrategia: parsed.estrategia || parsed.tipoEntrada || 'texto',
    saldo,
    multaEsperada,
    encontradoPor: found?.label || null,
    trecho: found?.trecho || null,
    observacoes: [
      ...(parsed.observacoes || []),
      ...(saldo === null ? ['Não foi possível localizar automaticamente o saldo FGTS. Informe o saldo manualmente.'] : [`Saldo FGTS localizado por: ${found.label}.`])
    ],
    erroLeitura: parsed.erroLeitura || null
  };
}

module.exports = { normalizeFGTS, parseBRNumber };
