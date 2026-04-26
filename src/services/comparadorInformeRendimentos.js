const { roundMoney, toNumber } = require('../utils/money');

function getDemissaoYear(calculo = {}) {
  const value = calculo?.entradas?.dataDemissao || calculo?.entrada?.dataDemissao || calculo?.formulario?.dataDemissao || calculo?.dataDemissao;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getFullYear() : null;
}

function getSalarioBase(calculo = {}) {
  return toNumber(
    calculo?.entradas?.salarioBase
    ?? calculo?.entrada?.salarioBase
    ?? calculo?.formulario?.salarioBase
    ?? calculo?.memoria?.remuneracaoBase
    ?? calculo?.salarioBase
  );
}

function getTotalBrutoTRCT(calculo = {}) {
  return toNumber(
    calculo?.totais?.bruto
    ?? calculo?.totalBruto
    ?? calculo?.campos?.totalBruto
    ?? calculo?.resultado?.totalBruto
  );
}

function getTotalDescontosTRCT(calculo = {}) {
  return toNumber(
    calculo?.totais?.descontos
    ?? calculo?.totalDescontos
    ?? calculo?.campos?.totalDescontos
    ?? calculo?.resultado?.totalDescontos
  );
}

function getRubrica(calculo = {}, ...keys) {
  for (const key of keys) {
    const value = calculo?.rubricas?.[key] ?? calculo?.[key] ?? calculo?.campos?.[key];
    const n = toNumber(value);
    if (n) return n;
  }
  return 0;
}

function buildRow(chave, item, sistema, ecac, tolerancia = 0.01) {
  const sistemaN = sistema === null || sistema === undefined || sistema === '' ? null : roundMoney(sistema);
  const ecacN = ecac === null || ecac === undefined || ecac === '' ? null : roundMoney(ecac);
  const diferenca = sistemaN === null || ecacN === null ? null : roundMoney(sistemaN - ecacN);
  let status = 'INFORMATIVO';
  if (sistemaN !== null && ecacN !== null) status = Math.abs(diferenca) <= tolerancia ? 'OK' : 'ALERTA';
  if (ecacN === null) status = 'NAO_LIDO';
  return { chave, item, sistema: sistemaN, ecac: ecacN, diferenca, status };
}

function conferirInformeComCalculo(calculo = {}, informe = {}) {
  const anoDemissao = getDemissaoYear(calculo);
  const anoInforme = Number(informe?.anoCalendario || 0) || null;
  const mesmoAnoDemissao = Boolean(anoDemissao && anoInforme && anoDemissao === anoInforme);
  const salarioBase = getSalarioBase(calculo);
  const totais = informe?.totais || {};
  const indicadores = informe?.indicadores || {};

  const totalBrutoTRCT = getTotalBrutoTRCT(calculo);
  const totalDescontosTRCT = getTotalDescontosTRCT(calculo);
  const decimoTerceiroSistema = getRubrica(calculo, 'decimoTerceiro', 'decimoTerceiroValor', 'decimoTerceiroProporcional');

  const baseRescisoriaAproximada = roundMoney(
    getRubrica(calculo, 'saldoSalario') +
    getRubrica(calculo, 'avisoPrevioValor', 'avisoPrevio') +
    getRubrica(calculo, 'feriasVencidasPrincipal', 'feriasVencidas') +
    getRubrica(calculo, 'tercoFeriasVencidas') +
    getRubrica(calculo, 'feriasProporcionaisPrincipal', 'feriasProporcionais') +
    getRubrica(calculo, 'tercoFeriasProporcionais')
  );

  const sistemaRendimento = totalBrutoTRCT || baseRescisoriaAproximada || null;
  const sistemaTotalCom13 = totalBrutoTRCT || null;

  const linhas = [
    buildRow('rendimentoTributavel', 'Rendimentos e-CAC x Total bruto TRCT/sistema', sistemaRendimento, totais.rendimentoTributavel, 1),
    buildRow('previdenciaOficial', 'Previdência oficial declarada no e-CAC', null, totais.previdenciaOficial),
    buildRow('impostoRetido', 'IRRF declarado no e-CAC', totalDescontosTRCT || null, totais.impostoRetido, 1),
    buildRow('decimoTerceiro', '13º e-CAC x 13º sistema', decimoTerceiroSistema || null, totais.decimoTerceiroRendimento, 1),
    buildRow('irrfDecimoTerceiro', 'IRRF do 13º declarado no e-CAC', null, totais.decimoTerceiroImpostoRetido),
    buildRow('totalCom13', 'Total e-CAC com 13º x Total bruto TRCT/sistema', sistemaTotalCom13, indicadores.rendimentoTotalCom13, 1),
    buildRow('mediaMensal', 'Média mensal tributável aproximada x salário base', salarioBase || null, indicadores.mediaMensalTributavel, Math.max(1, salarioBase * 0.25))
  ];

  const avisos = [];
  if (!informe?.anoCalendario) avisos.push('Ano-calendário não foi localizado no informe. Confira manualmente o campo extraído.');
  if (!informe?.fontesPagadoras?.length) avisos.push('Fonte pagadora não foi localizada automaticamente.');
  if (!mesmoAnoDemissao) {
    avisos.push('Atenção: o ano do e-CAC é diferente do ano da demissão. Mesmo assim, a comparação foi feita contra o TRCT/sistema para evidenciar diferença de valores.');
  }
  if (informe?.estrategia === 'ocr') avisos.push('Este arquivo foi lido por OCR. Revise os valores antes de usar em auditoria ou ação.');

  return {
    mesmoAnoDemissao,
    anoDemissao,
    anoInforme,
    salarioBase: roundMoney(salarioBase),
    totalBrutoTRCT: roundMoney(totalBrutoTRCT),
    totalDescontosTRCT: roundMoney(totalDescontosTRCT),
    baseRescisoriaAproximada,
    linhas,
    resumo: {
      totalItens: linhas.length,
      ok: linhas.filter((item) => item.status === 'OK').length,
      alertas: linhas.filter((item) => item.status === 'ALERTA').length,
      informativos: linhas.filter((item) => item.status === 'INFORMATIVO').length,
      naoLidos: linhas.filter((item) => item.status === 'NAO_LIDO').length
    },
    avisos
  };
}

module.exports = { conferirInformeComCalculo };
