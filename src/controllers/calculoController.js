const { calcularRescisao } = require('../services/calculoRescisao');
const { gerarMemoriaCalculo } = require('../services/memoriaCalculo');

function calcular(req, res) {
  const resultado = calcularRescisao(req.body);
  res.json({
    ok: true,
    ...resultado,
    memoriaTexto: gerarMemoriaCalculo(resultado)
  });
}

module.exports = {
  calcular
};
