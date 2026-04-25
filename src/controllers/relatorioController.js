const { createRelatorioBuffer } = require('../services/relatorioPdfService');

async function gerarRelatorioPdf(req, res, next) {
  try {
    const pdfBuffer = await createRelatorioBuffer(req.body || {});
    const nome = `relatorio_rescisao_${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
}

module.exports = { gerarRelatorioPdf };
