const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { importar } = require('../controllers/uploadController');

const uploadDir = path.join(os.tmpdir(), 'rescisao-trct-uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}-${file.originalname.replace(/\s+/g, '_')}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 12 * 1024 * 1024
  }
});

router.post('/', upload.single('arquivo'), importar);

module.exports = router;
