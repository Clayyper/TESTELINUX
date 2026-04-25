function gerarMemoriaCalculo(resultado) {
  return [
    `Remuneração base considerada: ${resultado.memoria.remuneracaoBase}`,
    `Dias de aviso prévio: ${resultado.memoria.diasAviso}`,
    `Meses de férias proporcionais: ${resultado.memoria.mesesFeriasProporcionais}`,
    `Meses de 13º proporcional: ${resultado.memoria.mesesDecimoTerceiro}`,
    `Base simplificada de INSS: ${resultado.memoria.baseInss}`,
    `Base simplificada de IRRF: ${resultado.memoria.baseIrrf}`
  ];
}

module.exports = {
  gerarMemoriaCalculo
};
