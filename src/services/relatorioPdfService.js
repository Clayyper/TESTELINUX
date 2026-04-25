const PDFDocument = require('pdfkit');

function money(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
}

function pct(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${Math.round(Number(value) * 100)}%`;
}

function labelStatus(status) {
  if (status === 'OK') return 'OK';
  if (status === 'NAO_LIDO') return 'NAO LIDO';
  return 'DIVERGENTE';
}

function drawBox(doc, x, y, w, h, title, value) {
  doc.save();
  doc.roundedRect(x, y, w, h, 10).fillAndStroke('#f7f9fc', '#d4dbe7');
  doc.fillColor('#5b677a').fontSize(9).text(title, x + 10, y + 8, { width: w - 20 });
  doc.fillColor('#172133').font('Helvetica-Bold').fontSize(16).text(value, x + 10, y + 24, { width: w - 20 });
  doc.restore();
}

function drawSectionTitle(doc, text, y) {
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(13).text(text, 40, y);
  doc.moveTo(40, y + 18).lineTo(555, y + 18).strokeColor('#cfd7e3').stroke();
}

function drawTable(doc, startY, rows) {
  const cols = [40, 185, 295, 405, 485];
  const headers = ['Rubrica', 'Sistema', 'TRCT', 'Diferença', 'Status'];
  let y = startY;

  const ensure = (need=24) => {
    if (y + need > 760) {
      doc.addPage();
      y = 40;
    }
  };

  ensure(28);
  doc.rect(40, y, 515, 24).fill('#1f3a5f');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
  headers.forEach((h, i) => doc.text(h, cols[i] + 6, y + 7, { width: (i===0?145:100) }));
  y += 24;

  rows.forEach((row, index) => {
    ensure(24);
    doc.rect(40, y, 515, 24).fill(index % 2 === 0 ? '#f8fafc' : '#eef3f8');
    doc.fillColor('#111827').font('Helvetica').fontSize(8.5);
    doc.text(row.rubrica || '—', cols[0] + 6, y + 7, { width: 135, ellipsis: true });
    doc.text(money(row.sistema), cols[1] + 6, y + 7, { width: 95, align: 'right' });
    doc.text(money(row.trct), cols[2] + 6, y + 7, { width: 95, align: 'right' });
    doc.text(row.diferenca == null ? '—' : money(row.diferenca), cols[3] + 6, y + 7, { width: 65, align: 'right' });
    doc.font(row.status === 'OK' ? 'Helvetica-Bold' : 'Helvetica').text(labelStatus(row.status), cols[4] + 6, y + 7, { width: 60, align: 'center' });
    y += 24;
  });

  return y;
}

function createRelatorioBuffer(payload) {
  return new Promise((resolve, reject) => {
    try {
      const calculo = payload.calculo || {};
      const trct = payload.trct || {};
      const auditoria = payload.auditoria || {};
      const campos = trct.campos || {};
      const modelo = trct.model || {};
      const confidence = trct.confidence || {};

      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const buffers = [];
      doc.on('data', (b) => buffers.push(b));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      doc.rect(0, 0, 595, 88).fill('#0f2745');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text('RELATÓRIO DE CONFERÊNCIA RESCISÓRIA', 40, 26);
      doc.font('Helvetica').fontSize(10).text('Modelo visual inspirado no TRCT para auditoria e conferência interna.', 40, 50);

      doc.fillColor('#111827');
      doc.roundedRect(40, 100, 515, 78, 12).fillAndStroke('#ffffff', '#d6deea');
      doc.fillColor('#334155').fontSize(9).font('Helvetica').text('Funcionário', 55, 114);
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(14).text(calculo?.entradas?.nome || 'Não informado', 55, 128);
      doc.font('Helvetica').fontSize(10).fillColor('#334155').text(`Admissão: ${calculo?.entradas?.dataAdmissao || campos.dataAdmissao || '—'}`, 320, 114);
      doc.text(`Desligamento: ${calculo?.entradas?.dataDemissao || campos.dataDesligamento || '—'}`, 320, 130);
      doc.text(`Salário base: ${money(calculo?.entradas?.salarioBase ?? campos.salarioBase)}`, 320, 146);

      drawBox(doc, 40, 195, 120, 58, 'Bruto calculado', money(calculo?.totais?.bruto));
      drawBox(doc, 172, 195, 120, 58, 'Descontos', money(calculo?.totais?.descontos));
      drawBox(doc, 304, 195, 120, 58, 'Líquido', money(calculo?.totais?.liquido));
      drawBox(doc, 436, 195, 119, 58, 'Confiança OCR', `${confidence?.label || '—'} / ${pct(confidence?.average)}`);

      drawSectionTitle(doc, 'Dados extraídos do documento', 272);
      doc.font('Helvetica').fontSize(10).fillColor('#111827');
      doc.text(`Modelo detectado: ${modelo?.modelLabel || 'Não identificado'}`, 40, 296);
      doc.text(`Motivo: ${campos.motivo || '—'}`, 40, 312, { width: 240 });
      doc.text(`Aviso prévio: ${campos.avisoInfo || '—'}`, 300, 296, { width: 240 });
      doc.text(`Admissão: ${campos.dataAdmissao || '—'}`, 300, 312);
      doc.text(`Desligamento: ${campos.dataDesligamento || '—'}`, 430, 312);

      drawSectionTitle(doc, 'Resumo da auditoria', 340);
      drawBox(doc, 40, 364, 120, 54, 'Rubricas', String(auditoria?.resumo?.totalRubricas ?? 0));
      drawBox(doc, 172, 364, 120, 54, 'OK', String(auditoria?.resumo?.ok ?? 0));
      drawBox(doc, 304, 364, 120, 54, 'Divergentes', String(auditoria?.resumo?.divergentes ?? 0));
      drawBox(doc, 436, 364, 119, 54, 'Não lidas', String(auditoria?.resumo?.naoLidas ?? 0));

      let y = 440;
      drawSectionTitle(doc, 'Conferência rubrica a rubrica', y);
      y = drawTable(doc, y + 24, auditoria?.auditoria || []);

      if ((calculo?.memoriaTexto || []).length) {
        if (y + 80 > 760) {
          doc.addPage();
          y = 40;
        }
        drawSectionTitle(doc, 'Memória de cálculo', y + 6);
        y += 30;
        doc.font('Helvetica').fontSize(9).fillColor('#334155');
        (calculo.memoriaTexto || []).slice(0, 10).forEach((item) => {
          if (y > 760) {
            doc.addPage();
            y = 40;
          }
          doc.text(`• ${item}`, 46, y, { width: 500 });
          y += 16;
        });
      }

      doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(
        'Relatório gerado pelo sistema de auditoria rescisória. Documento para conferência interna; validar com o TRCT oficial e critérios jurídicos aplicáveis.',
        40,
        790,
        { width: 515, align: 'center' }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { createRelatorioBuffer };
