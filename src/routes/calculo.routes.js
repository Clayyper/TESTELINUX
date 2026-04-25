const router = require('express').Router();
const { calcular } = require('../controllers/calculoController');

router.post('/', calcular);

module.exports = router;
