const express = require('express');
const { gerarRelatorioPdf } = require('../controllers/relatorioController');

const router = express.Router();
router.post('/', gerarRelatorioPdf);

module.exports = router;
