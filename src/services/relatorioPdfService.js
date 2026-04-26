function esc(value = '') {
  return String(value)
    .normalize('NFC')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n]+/g, ' ');
}

function brl(value) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dateBR(value) {
  if (!value) return 'Não informado';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  return s;
}

function pct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  return `${Math.round((n <= 1 ? n * 100 : n))}%`;
}

function pick(...values) {
  return values.find((v) => v !== undefined && v !== null && v !== '') ?? null;
}

function normalizePayload(payload = {}) {
  const calculo = payload.calculo || payload.calculado || {};
  const trct = payload.trct || {};
  const auditoriaPack = payload.auditoria || {};
  const auditoria = Array.isArray(auditoriaPack) ? auditoriaPack : (auditoriaPack.auditoria || []);
  const resumo = auditoriaPack.resumo || {};
  const campos = trct.campos || trct || {};

  const rubricas = Array.isArray(auditoria) ? auditoria : [];
  const ok = pick(resumo.ok, rubricas.filter((r) => r.status === 'OK').length, 0);
  const divergentes = pick(resumo.divergentes, resumo.divergente, rubricas.filter((r) => r.status === 'DIVERGENTE').length, 0);
  const naoLidas = pick(resumo.naoLidas, resumo.naoLido, rubricas.filter((r) => r.status === 'NAO_LIDO' || r.status === 'NAO LIDO').length, 0);

  return {
    funcionario: {
      nome: pick(campos.nomeFuncionario, campos.funcionario, campos.nome, calculo.nomeFuncionario, calculo.funcionario, 'Não informado'),
      admissao: pick(calculo.entrada, calculo.admissao, campos.admissao, campos.dataAdmissao),
      desligamento: pick(calculo.saida, calculo.desligamento, campos.desligamento, campos.dataDesligamento),
      salario: pick(calculo.salarioBase, calculo.salario, campos.salarioBase, campos.salario, 0)
    },
    totais: {
      bruto: pick(calculo?.totais?.bruto, calculo.bruto, campos.totalBruto, 0),
      descontos: pick(calculo?.totais?.descontos, calculo.descontos, campos.totalDescontos, 0),
      liquido: pick(calculo?.totais?.liquido, calculo.liquido, campos.liquido, 0)
    },
    trct: {
      modelo: pick(trct?.model?.modelLabel, trct.modelo, trct.modelLabel, 'TRCT padrão tabelado com texto nativo'),
      estrategia: pick(trct.estrategia, trct.strategy, 'texto nativo'),
      motivo: pick(campos.motivo, campos.motivoRescisao, 'Dispensa sem justa causa'),
      aviso: pick(campos.avisoPrevioTipo, campos.avisoPrevio, campos.aviso, 'Indenizado'),
      confiancaLabel: pick(trct?.confidence?.label, trct.confiancaLabel, 'média'),
      confianca: pick(trct?.confidence?.average, trct.confianca, trct?.model?.confidence, 0.89)
    },
    resumo: {
      totalRubricas: pick(resumo.totalRubricas, rubricas.length, 0),
      ok,
      divergentes,
      naoLidas
    },
    rubricas,
    memoria: Array.isArray(calculo.memoriaTexto)
      ? calculo.memoriaTexto
      : String(calculo.memoriaTexto || '').split(/\r?\n/).filter(Boolean),
    calculo
  };
}

class PdfDoc {
  constructor() {
    this.objects = [];
    this.pages = [];
    this.fontId = null;
  }
  addObject(content) { this.objects.push(content); return this.objects.length; }
  addPage(content) { this.pages.push(content); }
  build() {
    this.objects = [];
    const catalogId = this.addObject('<< /Type /Catalog /Pages 2 0 R >>');
    const pagesId = this.addObject('PAGES_PLACEHOLDER');
    this.fontId = this.addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const boldId = this.addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    const pageIds = [];
    for (const content of this.pages) {
      const stream = `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`;
      const streamId = this.addObject(stream);
      const pageId = this.addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${this.fontId} 0 R /F2 ${boldId} 0 R >> >> /Contents ${streamId} 0 R >>`);
      pageIds.push(pageId);
    }
    this.objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    this.objects.forEach((obj, idx) => {
      offsets.push(Buffer.byteLength(pdf, 'latin1'));
      pdf += `${idx + 1} 0 obj\n${obj}\nendobj\n`;
    });
    const xref = Buffer.byteLength(pdf, 'latin1');
    pdf += `xref\n0 ${this.objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
    pdf += `trailer\n<< /Size ${this.objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(pdf, 'latin1');
  }
}

class Page {
  constructor() { this.ops = []; }
  raw(s) { this.ops.push(s); }
  text(x, y, text, size = 10, font = 'F1') { this.raw(`BT /${font} ${size} Tf ${x} ${y} Td (${esc(text)}) Tj ET`); }
  line(x1, y1, x2, y2, w = 0.5) { this.raw(`${w} w ${x1} ${y1} m ${x2} ${y2} l S`); }
  rect(x, y, w, h, fill = null, stroke = true) {
    if (fill !== null) this.raw(`${fill} g ${x} ${y} ${w} ${h} re f 0 g`);
    if (stroke) this.raw(`0.75 w ${x} ${y} ${w} ${h} re S`);
  }
  content() { return this.ops.join('\n'); }
}

function drawHeader(p) {
  p.rect(34, 776, 527, 36, 0.92, false);
  p.text(48, 797, 'RELATÓRIO DE CONFERÊNCIA RESCISÓRIA', 15, 'F2');
  p.text(48, 782, 'Modelo visual inspirado no TRCT para auditoria e conferência interna.', 8, 'F1');
}

function drawSummaryCard(p, x, y, w, h, title, value, subtitle) {
  p.rect(x, y, w, h, 0.96, true);
  p.text(x + 10, y + h - 15, title, 8, 'F2');
  p.text(x + 10, y + 20, value, 15, 'F2');
  if (subtitle) p.text(x + 10, y + 8, subtitle, 7, 'F1');
}

function drawPage1(p, data) {
  drawHeader(p);
  const f = data.funcionario;
  p.text(40, 748, 'Funcionário', 9, 'F2');
  p.text(40, 732, f.nome || 'Não informado', 13, 'F2');
  p.text(40, 714, `Admissão: ${dateBR(f.admissao)}`, 9);
  p.text(190, 714, `Desligamento: ${dateBR(f.desligamento)}`, 9);
  p.text(385, 714, `Salário base: ${brl(f.salario)}`, 9);

  drawSummaryCard(p, 40, 646, 126, 54, 'Bruto calculado', brl(data.totais.bruto), null);
  drawSummaryCard(p, 178, 646, 126, 54, 'Descontos', brl(data.totais.descontos), null);
  drawSummaryCard(p, 316, 646, 126, 54, 'Líquido', brl(data.totais.liquido), null);
  drawSummaryCard(p, 454, 646, 101, 54, 'Confiança OCR', `${data.trct.confiancaLabel || 'média'} / ${pct(data.trct.confianca)}`, null);

  p.text(40, 616, 'Dados extraídos do documento', 11, 'F2');
  p.rect(40, 556, 515, 50, 0.985, true);
  p.text(52, 590, `Modelo detectado: ${data.trct.modelo}`, 9);
  p.text(52, 574, `Motivo: ${data.trct.motivo}`, 9);
  p.text(300, 574, `Aviso prévio: ${data.trct.aviso}`, 9);
  p.text(52, 558, `Admissão: ${dateBR(f.admissao)}  Desligamento: ${dateBR(f.desligamento)}`, 9);

  p.text(40, 526, 'Resumo da auditoria', 11, 'F2');
  drawSummaryCard(p, 40, 472, 118, 42, 'Rubricas', String(data.resumo.totalRubricas), null);
  drawSummaryCard(p, 174, 472, 118, 42, 'OK', String(data.resumo.ok), null);
  drawSummaryCard(p, 308, 472, 118, 42, 'Divergentes', String(data.resumo.divergentes), null);
  drawSummaryCard(p, 442, 472, 113, 42, 'Não lidas', String(data.resumo.naoLidas), null);

  p.text(40, 442, 'Conferência rubrica a rubrica', 11, 'F2');
  const cols = [40, 220, 300, 380, 460];
  const widths = [180, 80, 80, 80, 95];
  let y = 416;
  p.rect(40, y, 515, 20, 0.88, true);
  ['Rubrica', 'Sistema', 'TRCT', 'Diferença', 'Status'].forEach((h, i) => p.text(cols[i] + 4, y + 7, h, 8, 'F2'));
  y -= 22;
  (data.rubricas || []).slice(0, 9).forEach((item, idx) => {
    if (idx % 2 === 0) p.rect(40, y - 3, 515, 18, 0.97, false);
    p.text(cols[0] + 4, y + 2, item.rubrica || item.chave || '-', 8);
    p.text(cols[1] + 4, y + 2, brl(item.sistema), 8);
    p.text(cols[2] + 4, y + 2, item.trct == null ? '—' : brl(item.trct), 8);
    p.text(cols[3] + 4, y + 2, item.diferenca == null ? '—' : brl(item.diferenca), 8);
    p.text(cols[4] + 4, y + 2, String(item.status || '-').replace('_', ' '), 8, 'F2');
    y -= 20;
  });
  p.text(40, 46, 'Relatório gerado pelo sistema de auditoria rescisória. Documento para conferência interna; validar com o TRCT oficial e critérios jurídicos aplicáveis.', 7);
}

function drawPage2(p, data) {
  drawHeader(p);
  p.text(40, 742, 'Memória de cálculo', 13, 'F2');
  const lines = data.memoria.length ? data.memoria : [
    `Remuneração base considerada: ${data.funcionario.salario || 0}`,
    `Dias de aviso prévio: ${pick(data.calculo?.parametros?.diasAvisoPrevio, data.calculo?.diasAvisoPrevio, '-')}`,
    `Total bruto calculado: ${brl(data.totais.bruto)}`,
    `Total de descontos: ${brl(data.totais.descontos)}`,
    `Valor líquido: ${brl(data.totais.liquido)}`
  ];
  let y = 710;
  lines.slice(0, 30).forEach((line) => {
    p.text(54, y, `• ${line.replace(/^•\s*/, '')}`, 10);
    y -= 18;
  });
  p.text(40, 58, 'Relatório gerado pelo sistema de auditoria rescisória. Documento para conferência interna; validar com o TRCT oficial e critérios jurídicos aplicáveis.', 8);
}

function drawPage3(p, data) {
  drawHeader(p);
  p.text(40, 742, 'Observações de conferência', 13, 'F2');
  p.rect(40, 626, 515, 88, 0.97, true);
  p.text(54, 690, '1. Este relatório reproduz o formato de conferência usado na versão anterior.', 10);
  p.text(54, 670, '2. Valores divergentes devem ser conferidos contra o TRCT oficial e documentos internos.', 10);
  p.text(54, 650, '3. Campos marcados como NÃO LIDO dependem da qualidade do PDF/imagem importado.', 10);
  p.text(40, 590, `Gerado em: ${new Date().toLocaleString('pt-BR')}`, 9);
  p.text(40, 58, 'Fim do relatório.', 8);
}

async function createRelatorioBuffer(payload = {}) {
  const data = normalizePayload(payload);
  const doc = new PdfDoc();
  const p1 = new Page(); drawPage1(p1, data); doc.addPage(p1.content());
  const p2 = new Page(); drawPage2(p2, data); doc.addPage(p2.content());
  const p3 = new Page(); drawPage3(p3, data); doc.addPage(p3.content());
  return doc.build();
}

module.exports = { createRelatorioBuffer, normalizePayload };
