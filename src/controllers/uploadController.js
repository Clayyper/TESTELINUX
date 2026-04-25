const fs = require('fs/promises');
const { parseTRCT } = require('../services/parserTRCT');
const { normalizeTRCT } = require('../services/normalizadorTRCT');

async function importar(req, res, next) {
  let filePath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'Nenhum arquivo enviado.' });
    }

    filePath = req.file.path;
    const parsed = await parseTRCT(filePath, req.file.mimetype);
    const normalized = normalizeTRCT(parsed);

    return res.status(parsed.ok === false ? 422 : 200).json({
      ok: parsed.ok !== false,
      arquivo: {
        nome: req.file.originalname,
        tipo: req.file.mimetype,
        tamanho: req.file.size
      },
      ...normalized,
      erroLeitura: parsed.erroLeitura || null
    });
  } catch (error) {
    return next(error);
  } finally {
    if (filePath) {
      fs.unlink(filePath).catch(() => {});
    }
  }
}

module.exports = {
  importar
};
