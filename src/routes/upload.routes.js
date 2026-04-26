const router = require('express').Router();
const multer = require('multer');
const { importar } = require('../controllers/uploadController');

// Vercel/serverless: não gravar upload em pasta do projeto.
// O arquivo fica em memória só durante a requisição.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /pdf|png|jpe?g|webp/i.test(file.mimetype) || /\.(pdf|png|jpe?g|webp)$/i.test(file.originalname);
    cb(ok ? null : new Error('Formato inválido. Envie PDF, PNG, JPG, JPEG ou WEBP.'), ok);
  }
});

router.post('/', upload.single('arquivo'), importar);

module.exports = router;
