const { compareRubricas } = require('../services/comparadorTRCT');

function auditar(req, res) {
  const { calculado, calculo, trct } = req.body || {};
  const baseCalculo = calculado || calculo;
  if (!baseCalculo) {
    return res.status(400).json({ ok: false, error: 'Cálculo não informado para auditoria.' });
  }
  if (!trct) {
    return res.status(400).json({ ok: false, error: 'TRCT não informado para auditoria.' });
  }
  const resultado = compareRubricas(baseCalculo, trct);
  return res.json({ ok: true, ...resultado });
}

module.exports = { auditar };
