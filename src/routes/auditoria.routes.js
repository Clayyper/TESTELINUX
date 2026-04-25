const router = require('express').Router();
const { auditar } = require('../controllers/auditoriaController');

router.post('/', auditar);

module.exports = router;
