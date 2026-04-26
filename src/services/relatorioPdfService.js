function escapePdfText(value = '') {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 110);
}

function brl(value) {
  const n = Number(value || 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function makePdf(lines) {
  const objects = [];
  const add = (content) => {
    objects.push(content);
    return objects.length;
  };

  const catalogId = add('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesId = add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  const pageId = add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>');
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const textLines = lines.map((line, idx) => {
    const y = 800 - idx * 18;
    return `BT /F1 10 Tf 50 ${y} Td (${escapePdfText(line)}) Tj ET`;
  }).join('\n');
  const stream = `<< /Length ${Buffer.byteLength(textLines, 'utf8')} >>\nstream\n${textLines}\nendstream`;
  const streamId = add(stream);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, idx) => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${idx + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

async function createRelatorioBuffer(payload = {}) {
  const calculo = payload.calculo || {};
  const trct = payload.trct || {};
  const auditoria = payload.auditoria?.auditoria || payload.auditoria || [];

  const lines = [
    'Relatorio de Conferencia de Rescisao / TRCT',
    `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
    '',
    `Total bruto calculado: ${brl(calculo?.totais?.bruto)}`,
    `Total descontos calculado: ${brl(calculo?.totais?.descontos)}`,
    `Liquido calculado: ${brl(calculo?.totais?.liquido)}`,
    '',
    `Estrategia de leitura TRCT: ${trct?.estrategia || '-'}`,
    `Modelo detectado: ${trct?.model?.modelLabel || '-'}`,
    '',
    'Comparacao:'
  ];

  (Array.isArray(auditoria) ? auditoria : []).slice(0, 30).forEach((item) => {
    lines.push(`${item.rubrica || item.chave}: Sistema ${brl(item.sistema)} | TRCT ${item.trct == null ? 'nao lido' : brl(item.trct)} | ${item.status || '-'}`);
  });

  return makePdf(lines);
}

module.exports = { createRelatorioBuffer };
