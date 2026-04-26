'use strict';

const router = require('express').Router();
const multer = require('multer');
const { importarFGTS, importarFGTSLote } = require('../controllers/fgtsController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    const ok = /pdf|png|jpe?g|webp/i.test(file.mimetype) || /\.(pdf|png|jpe?g|webp)$/i.test(file.originalname);
    cb(ok ? null : new Error('Formato inválido. Envie PDF, PNG, JPG, JPEG ou WEBP.'), ok);
  }
});

router.post('/importar', upload.single('arquivo'), importarFGTS);
router.post('/importar-lote', upload.array('arquivos', 20), importarFGTSLote);

module.exports = router;
