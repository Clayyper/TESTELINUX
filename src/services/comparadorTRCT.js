const { roundMoney } = require('../utils/money');

function mapCalculoToComparable(calculo) {
  return {
    saldoSalario: calculo?.rubricas?.saldoSalario || 0,
    avisoPrevio: calculo?.rubricas?.avisoPrevioValor || 0,
    feriasVencidas: (calculo?.rubricas?.feriasVencidasPrincipal || 0) + (calculo?.rubricas?.tercoFeriasVencidas || 0),
    feriasProporcionais: (calculo?.rubricas?.feriasProporcionaisPrincipal || 0) + (calculo?.rubricas?.tercoFeriasProporcionais || 0),
    decimoTerceiro: calculo?.rubricas?.decimoTerceiro || 0,
    multaFgts: calculo?.rubricas?.multaFgts || 0,
    totalBruto: calculo?.totais?.bruto || 0,
    totalDescontos: calculo?.totais?.descontos || 0,
    liquido: calculo?.totais?.liquido || 0
  };
}

function compareRubricas(calculo, trct) {
  const sistema = mapCalculoToComparable(calculo);
  const documento = trct?.campos || trct || {};
  const detalhado = trct?.camposDetalhados || {};

  const labels = {
    saldoSalario: 'Saldo de salário',
    avisoPrevio: 'Aviso prévio',
    feriasVencidas: 'Férias vencidas + 1/3',
    feriasProporcionais: 'Férias proporcionais + 1/3',
    decimoTerceiro: '13º proporcional',
    multaFgts: 'Multa do FGTS',
    totalBruto: 'Total bruto',
    totalDescontos: 'Total de descontos',
    liquido: 'Líquido'
  };

  const auditoria = Object.keys(labels).map((key) => {
    const valorSistema = roundMoney(sistema[key] || 0);
    const docValue = documento[key];
    const valorTRCT = docValue == null ? null : roundMoney(docValue || 0);
    const diferenca = valorTRCT == null ? null : roundMoney(valorSistema - valorTRCT);
    const status = valorTRCT == null
      ? 'NAO_LIDO'
      : Math.abs(diferenca) <= 0.01
        ? 'OK'
        : 'DIVERGENTE';

    return {
      chave: key,
      rubrica: labels[key],
      sistema: valorSistema,
      trct: valorTRCT,
      diferenca,
      status,
      confidence: detalhado[key]?.confidence ?? null,
      confidenceLabel: detalhado[key]?.confidenceLabel ?? null,
      source: detalhado[key]?.source ?? null
    };
  });

  return {
    auditoria,
    resumo: {
      totalRubricas: auditoria.length,
      ok: auditoria.filter((item) => item.status === 'OK').length,
      divergentes: auditoria.filter((item) => item.status === 'DIVERGENTE').length,
      naoLidas: auditoria.filter((item) => item.status === 'NAO_LIDO').length
    }
  };
}

module.exports = {
  compareRubricas,
  mapCalculoToComparable
};
