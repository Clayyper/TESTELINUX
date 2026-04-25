const { compareRubricas } = require('../services/comparadorTRCT');

function auditar(req, res) {
  const { calculado, trct } = req.body;
  const resultado = compareRubricas(calculado, trct);
  res.json({ ok: true, ...resultado });
}

module.exports = {
  auditar
};
