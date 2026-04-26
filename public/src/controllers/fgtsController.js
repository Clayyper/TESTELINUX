'use strict';

const { parseTRCT } = require('../services/parserTRCT');
const { normalizeFGTS } = require('../services/normalizadorFGTS');

async function importarFGTS(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'Nenhum arquivo enviado.' });

    const parsed = await parseTRCT({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalname: req.file.originalname
    });

    const fgts = normalizeFGTS(parsed, req.file);
    return res.status(fgts.ok ? 200 : 422).json(fgts);
  } catch (error) {
    return next(error);
  }
}

module.exports = { importarFGTS };
