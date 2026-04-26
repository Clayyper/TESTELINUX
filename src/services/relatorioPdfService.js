'use strict';

function hexColor(hex) {
  const h = String(hex || '#000000').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}

const COLORS = {
  ink: '#111827',
  muted: '#6b7280',
  navy: '#123456',
  navyDark: '#0f2538',
  blueLight: '#eaf2fb',
  gray: '#f3f4f6',
  gray2: '#f9fafb',
  border: '#cbd5e1',
  ok: '#15803d',
  warn: '#b45309',
  bad: '#b91c1c',
  white: '#ffffff'
};

function pdfText(value) {
  const s = String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ');
  const bytes = Buffer.from('\uFEFF' + s, 'utf16le');
  for (let i = 2; i < bytes.length; i += 2) {
    const a = bytes[i]; bytes[i] = bytes[i + 1]; bytes[i + 1] = a;
  }
  return `<${bytes.toString('hex').toUpperCase()}>`;
}

function brl(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value || 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function pct(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${Math.round((n > 1 ? n : n * 100))}%`;
}

function fmtDate(value) {
  if (!value) return '—';
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`;
  return s;
}

function firstDefined(...values) {
  return values.find((v) => v !== undefined && v !== null && v !== '');
}

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePayload(payload = {}) {
  const calculo = payload.calculo || {};
  const trct = payload.trct || {};
  const campos = trct.campos || trct || {};
  const auditoriaObj = payload.auditoria?.auditoria ? payload.auditoria : (payload.auditoria || {});
  const auditoria = Array.isArray(auditoriaObj.auditoria) ? auditoriaObj.auditoria : (Array.isArray(payload.auditoria) ? payload.auditoria : []);
  const resumo = auditoriaObj.resumo || {
    totalRubricas: auditoria.length,
    ok: auditoria.filter((r) => r.status === 'OK').length,
    divergentes: auditoria.filter((r) => r.status === 'DIVERGENTE').length,
    naoLidas: auditoria.filter((r) => r.status === 'NAO_LIDO' || r.status === 'NAO LIDO').length
  };

  const formulario = payload.formulario || calculo.formulario || {};
  const funcionario = {
    nome: firstDefined(campos.nome, campos.funcionario, formulario.nome, calculo.nomeFuncionario, 'Não informado'),
    admissao: firstDefined(campos.admissao, campos.dataAdmissao, formulario.dataAdmissao, calculo.dataAdmissao),
    desligamento: firstDefined(campos.desligamento, campos.dataDemissao, formulario.dataDemissao, calculo.dataDemissao),
    salario: firstDefined(campos.salarioBase, campos.salario, formulario.salarioBase, formulario.salario, calculo.salarioBase)
  };

  const memoria = Array.isArray(calculo.memoriaTexto) ? calculo.memoriaTexto : [];
  const rubricas = auditoria.length ? auditoria : Object.entries(calculo.rubricas || {}).map(([chave, valor]) => ({
    chave,
    rubrica: chave,
    sistema: valor,
    trct: null,
    diferenca: null,
    status: 'NAO_LIDO'
  }));

  return {
    calculo,
    trct,
    campos,
    funcionario,
    rubricas,
    resumo,
    memoria,
    modelo: firstDefined(trct.model?.modelLabel, trct.modelo, trct.estrategia, campos.modelo, 'TRCT padrão / conferência'),
    estrategia: firstDefined(trct.estrategia, trct.strategy, '-'),
    confianca: firstDefined(trct.confidence, trct.confianca, trct.mediaConfianca, campos.confianca, null),
    motivo: firstDefined(campos.motivo, formulario.motivo, 'Dispensa sem justa causa'),
    aviso: firstDefined(campos.avisoPrevio, calculo?.parametros?.avisoPrevioTipo, formulario.avisoPrevioTipo, '-'),
    diasAviso: firstDefined(calculo?.parametros?.diasAvisoPrevio, campos.diasAvisoPrevio, formulario.diasAvisoPrevio, null),
    totais: {
      bruto: firstDefined(calculo?.totais?.bruto, campos.totalBruto, campos.bruto, 0),
      descontos: firstDefined(calculo?.totais?.descontos, campos.totalDescontos, campos.descontos, 0),
      liquido: firstDefined(calculo?.totais?.liquido, campos.liquido, 0)
    }
  };
}

class PdfBuilder {
  constructor() {
    this.objects = [];
    this.pages = [];
    this.current = null;
    this.width = 595;
    this.height = 842;
    this.margin = 34;
  }

  newPage() {
    this.current = [];
    this.pages.push(this.current);
    return this;
  }

  cmd(s) { this.current.push(s); return this; }
  fill(hex) { return this.cmd(`${hexColor(hex)} rg`); }
  stroke(hex) { return this.cmd(`${hexColor(hex)} RG`); }
  lineWidth(w) { return this.cmd(`${w} w`); }

  rect(x, yTop, w, h, fill = null, stroke = COLORS.border, lw = 0.7) {
    const y = this.height - yTop - h;
    this.lineWidth(lw);
    if (fill) this.fill(fill);
    if (stroke) this.stroke(stroke);
    this.cmd(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
    return this;
  }

  line(x1, y1Top, x2, y2Top, color = COLORS.border, lw = 0.7) {
    this.stroke(color).lineWidth(lw);
    const y1 = this.height - y1Top;
    const y2 = this.height - y2Top;
    return this.cmd(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  text(value, x, yTop, opts = {}) {
    const size = opts.size || 9;
    const color = opts.color || COLORS.ink;
    const font = opts.bold ? 'F2' : 'F1';
    const y = this.height - yTop - size;
    this.fill(color);
    this.cmd(`BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfText(value)} Tj ET`);
    return this;
  }

  textRight(value, xRight, yTop, opts = {}) {
    const size = opts.size || 9;
    const text = String(value ?? '');
    const approx = text.length * size * 0.47;
    return this.text(text, xRight - approx, yTop, opts);
  }

  textCenter(value, x, w, yTop, opts = {}) {
    const size = opts.size || 9;
    const text = String(value ?? '');
    const approx = text.length * size * 0.47;
    return this.text(text, x + Math.max(0, (w - approx) / 2), yTop, opts);
  }

  addObject(content) {
    this.objects.push(content);
    return this.objects.length;
  }

  build() {
    const fontRegularId = 3;
    const fontBoldId = 4;
    const kids = [];
    const pageContents = this.pages.map((page) => page.join('\n'));
    const pageIds = [];

    this.objects = [];
    const catalogId = this.addObject('<< /Type /Catalog /Pages 2 0 R >>');
    this.addObject('PAGES_PLACEHOLDER');
    this.addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    this.addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    pageContents.forEach((content) => {
      const stream = `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`;
      const contentId = this.addObject(stream);
      const pageId = this.addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.width} ${this.height}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`);
      pageIds.push(pageId);
      kids.push(`${pageId} 0 R`);
    });

    this.objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pageIds.length} >>`;

    let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets = [0];
    this.objects.forEach((obj, idx) => {
      offsets.push(Buffer.byteLength(pdf, 'binary'));
      pdf += `${idx + 1} 0 obj\n${obj}\nendobj\n`;
    });
    const xref = Buffer.byteLength(pdf, 'binary');
    pdf += `xref\n0 ${this.objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
    pdf += `trailer\n<< /Size ${this.objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(pdf, 'binary');
  }
}

function statusLabel(status) {
  const s = String(status || '').replace('_', ' ').toUpperCase();
  if (s === 'NAO LIDO') return 'NÃO LIDO';
  return s || '—';
}
function statusColor(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'OK') return COLORS.ok;
  if (s === 'DIVERGENTE') return COLORS.bad;
  return COLORS.warn;
}

function drawHeader(pdf, title) {
  pdf.rect(34, 24, 527, 58, COLORS.navy, COLORS.navyDark, 0.8);
  pdf.textCenter('TERMO DE RESCISÃO DO CONTRATO DE TRABALHO - TRCT', 42, 511, 37, { size: 13, bold: true, color: COLORS.white });
  pdf.textCenter(title, 42, 511, 57, { size: 9, color: '#dbeafe' });
  pdf.text('Documento de conferência interna - layout inspirado no padrão oficial', 42, 91, { size: 7.5, color: COLORS.muted });
  pdf.textRight(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 560, 91, { size: 7.5, color: COLORS.muted });
}

function drawSection(pdf, y, label) {
  pdf.rect(34, y, 527, 20, COLORS.blueLight, COLORS.border, 0.7);
  pdf.text(label, 44, y + 5, { size: 9, bold: true, color: COLORS.navyDark });
}

function drawField(pdf, x, y, w, label, value, h = 38) {
  pdf.rect(x, y, w, h, COLORS.white, COLORS.border, 0.6);
  pdf.text(label, x + 7, y + 6, { size: 6.8, color: COLORS.muted, bold: true });
  pdf.text(String(value ?? '—').slice(0, 44), x + 7, y + 19, { size: 9, color: COLORS.ink });
}

function drawCard(pdf, x, y, w, label, value, color = COLORS.navy) {
  pdf.rect(x, y, w, 54, COLORS.gray2, COLORS.border, 0.7);
  pdf.rect(x, y, w, 5, color, color, 0);
  pdf.text(label, x + 10, y + 12, { size: 7.5, color: COLORS.muted, bold: true });
  pdf.text(value, x + 10, y + 28, { size: 13, color, bold: true });
}

function drawOfficialLayoutPage1(pdf, data) {
  pdf.newPage();
  drawHeader(pdf, 'RELATÓRIO DE CONFERÊNCIA RESCISÓRIA');

  drawSection(pdf, 112, '01 - IDENTIFICAÇÃO DO EMPREGADO E DO CONTRATO');
  drawField(pdf, 34, 138, 255, 'EMPREGADO', data.funcionario.nome || 'Não informado');
  drawField(pdf, 296, 138, 80, 'ADMISSÃO', fmtDate(data.funcionario.admissao));
  drawField(pdf, 383, 138, 86, 'DESLIGAMENTO', fmtDate(data.funcionario.desligamento));
  drawField(pdf, 476, 138, 85, 'SALÁRIO BASE', brl(data.funcionario.salario));

  drawField(pdf, 34, 184, 220, 'MOTIVO DO DESLIGAMENTO', data.motivo);
  drawField(pdf, 261, 184, 145, 'AVISO PRÉVIO', `${data.aviso}${data.diasAviso ? ` (${data.diasAviso} dias)` : ''}`);
  drawField(pdf, 413, 184, 148, 'CONFIANÇA DA LEITURA / OCR', `${pct(data.confianca)}  ${data.estrategia || ''}`.trim());

  drawSection(pdf, 238, '02 - RESUMO FINANCEIRO CALCULADO');
  drawCard(pdf, 34, 267, 165, 'BRUTO CALCULADO', brl(data.totais.bruto), COLORS.navy);
  drawCard(pdf, 215, 267, 165, 'DESCONTOS', brl(data.totais.descontos), COLORS.warn);
  drawCard(pdf, 396, 267, 165, 'LÍQUIDO', brl(data.totais.liquido), COLORS.ok);

  drawSection(pdf, 344, '03 - DADOS EXTRAÍDOS DO DOCUMENTO');
  drawField(pdf, 34, 371, 345, 'MODELO DETECTADO', data.modelo, 42);
  drawField(pdf, 386, 371, 175, 'STATUS DA AUDITORIA', `${data.resumo?.totalRubricas || data.rubricas.length} rubricas analisadas`, 42);
  drawField(pdf, 34, 420, 167, 'OK', String(data.resumo.ok || 0), 38);
  drawField(pdf, 214, 420, 167, 'DIVERGENTES', String(data.resumo.divergentes || 0), 38);
  drawField(pdf, 394, 420, 167, 'NÃO LIDAS', String(data.resumo.naoLidas || 0), 38);

  drawSection(pdf, 482, '04 - CONFERÊNCIA RUBRICA A RUBRICA');
  const x = 34;
  const y = 509;
  const cols = [188, 87, 87, 87, 78];
  const heads = ['RUBRICA', 'SISTEMA', 'TRCT', 'DIFERENÇA', 'STATUS'];
  let cx = x;
  pdf.rect(x, y, 527, 24, COLORS.navy, COLORS.navyDark, 0.7);
  heads.forEach((h, i) => { pdf.text(h, cx + 6, y + 8, { size: 7.6, bold: true, color: COLORS.white }); cx += cols[i]; });

  let rowY = y + 24;
  data.rubricas.slice(0, 12).forEach((r, idx) => {
    const fill = idx % 2 === 0 ? COLORS.white : COLORS.gray2;
    pdf.rect(x, rowY, 527, 26, fill, COLORS.border, 0.45);
    let c = x;
    pdf.text(String(r.rubrica || r.chave || 'Rubrica').slice(0, 36), c + 6, rowY + 8, { size: 7.2, color: COLORS.ink }); c += cols[0];
    pdf.textRight(brl(r.sistema), c + cols[1] - 6, rowY + 8, { size: 7.2, color: COLORS.ink }); c += cols[1];
    pdf.textRight(r.trct == null ? '—' : brl(r.trct), c + cols[2] - 6, rowY + 8, { size: 7.2, color: COLORS.ink }); c += cols[2];
    pdf.textRight(r.diferenca == null ? '—' : brl(r.diferenca), c + cols[3] - 6, rowY + 8, { size: 7.2, color: COLORS.ink }); c += cols[3];
    pdf.text(statusLabel(r.status), c + 6, rowY + 8, { size: 7.1, color: statusColor(r.status), bold: true });
    rowY += 26;
  });

  if (data.rubricas.length > 12) {
    pdf.text(`Continua na próxima página: ${data.rubricas.length - 12} rubrica(s) adicional(is).`, 38, rowY + 12, { size: 7.5, color: COLORS.muted });
  }

  const footY = 800;
  pdf.line(34, footY - 12, 561, footY - 12, COLORS.border, 0.6);
  pdf.text('Relatório gerado pelo sistema de auditoria rescisória. Validar com o TRCT oficial, convenção coletiva e critérios jurídicos aplicáveis.', 34, footY, { size: 7, color: COLORS.muted });
}

function drawContinuation(pdf, data) {
  pdf.newPage();
  drawHeader(pdf, 'MEMÓRIA DE CÁLCULO E COMPLEMENTO DA AUDITORIA');

  let y = 120;
  if (data.rubricas.length > 12) {
    drawSection(pdf, y, '04 - CONFERÊNCIA RUBRICA A RUBRICA - CONTINUAÇÃO');
    y += 27;
    const x = 34;
    const cols = [188, 87, 87, 87, 78];
    pdf.rect(x, y, 527, 24, COLORS.navy, COLORS.navyDark, 0.7);
    ['RUBRICA', 'SISTEMA', 'TRCT', 'DIFERENÇA', 'STATUS'].forEach((h, i) => pdf.text(h, x + 6 + cols.slice(0, i).reduce((a, b) => a + b, 0), y + 8, { size: 7.6, bold: true, color: COLORS.white }));
    y += 24;
    data.rubricas.slice(12).forEach((r, idx) => {
      if (y > 730) return;
      const fill = idx % 2 === 0 ? COLORS.white : COLORS.gray2;
      pdf.rect(x, y, 527, 26, fill, COLORS.border, 0.45);
      let c = x;
      pdf.text(String(r.rubrica || r.chave || 'Rubrica').slice(0, 36), c + 6, y + 8, { size: 7.2 }); c += cols[0];
      pdf.textRight(brl(r.sistema), c + cols[1] - 6, y + 8, { size: 7.2 }); c += cols[1];
      pdf.textRight(r.trct == null ? '—' : brl(r.trct), c + cols[2] - 6, y + 8, { size: 7.2 }); c += cols[2];
      pdf.textRight(r.diferenca == null ? '—' : brl(r.diferenca), c + cols[3] - 6, y + 8, { size: 7.2 }); c += cols[3];
      pdf.text(statusLabel(r.status), c + 6, y + 8, { size: 7.1, color: statusColor(r.status), bold: true });
      y += 26;
    });
    y += 22;
  }

  drawSection(pdf, y, '05 - MEMÓRIA DE CÁLCULO');
  y += 30;
  const memoria = data.memoria.length ? data.memoria : [
    `Remuneração base considerada: ${brl(data.funcionario.salario)}`,
    `Data de admissão: ${fmtDate(data.funcionario.admissao)}`,
    `Data de desligamento: ${fmtDate(data.funcionario.desligamento)}`,
    `Aviso prévio: ${data.aviso}${data.diasAviso ? ` (${data.diasAviso} dias)` : ''}`
  ];
  memoria.slice(0, 18).forEach((item) => {
    pdf.rect(44, y - 2, 8, 8, COLORS.navy, COLORS.navy, 0);
    pdf.text(String(item).replace(/^•\s*/, '').slice(0, 105), 60, y - 4, { size: 8.2, color: COLORS.ink });
    y += 20;
  });

  y += 15;
  drawSection(pdf, y, '06 - OBSERVAÇÕES');
  y += 30;
  const obs = [
    'Este documento é uma conferência interna e não substitui o TRCT oficial assinado.',
    'Valores divergentes devem ser revisados com base no documento original, FGTS, férias, aviso prévio e descontos legais.',
    'Campos não lidos indicam ausência de valor detectável no arquivo importado ou baixa confiança de OCR.'
  ];
  obs.forEach((item) => { pdf.text(`• ${item}`, 44, y, { size: 8, color: COLORS.ink }); y += 18; });

  pdf.line(34, 788, 561, 788, COLORS.border, 0.6);
  pdf.text('Assinatura / visto da conferência: ________________________________________________', 44, 806, { size: 8, color: COLORS.ink });
}

async function createRelatorioBuffer(payload = {}) {
  const data = normalizePayload(payload);
  const pdf = new PdfBuilder();
  drawOfficialLayoutPage1(pdf, data);
  drawContinuation(pdf, data);
  return pdf.build();
}

module.exports = { createRelatorioBuffer };
