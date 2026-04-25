const { roundMoney, toNumber } = require('../utils/money');
const { diffYears, monthsWorkedForProportion } = require('../utils/dates');

function calcularAvisoPrevioDias(dataAdmissao, dataDemissao, diasInformados) {
  const dias = Number(diasInformados);
  if (dias > 0) return dias;
  const anos = diffYears(dataAdmissao, dataDemissao);
  return Math.min(90, 30 + anos * 3);
}

function calcularFerias(valorBase, qtd = 0, emDobro = false) {
  const quantidade = Math.max(0, Number(qtd) || 0);
  const principal = valorBase * quantidade * (emDobro ? 2 : 1);
  const terco = principal / 3;
  return {
    principal: roundMoney(principal),
    terco: roundMoney(terco),
    total: roundMoney(principal + terco)
  };
}

function calcularFeriasProporcionais(remuneracaoBase, meses) {
  const principal = (remuneracaoBase / 12) * Math.max(0, Number(meses) || 0);
  const terco = principal / 3;
  return {
    principal: roundMoney(principal),
    terco: roundMoney(terco),
    total: roundMoney(principal + terco)
  };
}

function calcularDecimoTerceiro(remuneracaoBase, meses) {
  return roundMoney((remuneracaoBase / 12) * Math.max(0, Number(meses) || 0));
}

function calcularSaldoSalario(remuneracaoBase, diasTrabalhados, diasNaoPagos = 0) {
  const diasLiquidos = Math.max(0, toNumber(diasTrabalhados) - toNumber(diasNaoPagos));
  return roundMoney((remuneracaoBase / 30) * diasLiquidos);
}

function calcularInssFaixaUnica(valor) {
  // Simplificação inicial: campo pode ser substituído por tabela progressiva depois.
  return roundMoney(Math.max(0, valor) * 0.08);
}

function calcularIrrfSimplificado(base) {
  if (base <= 0) return 0;
  if (base <= 2824) return 0;
  if (base <= 3751) return roundMoney(base * 0.075 - 169.44);
  if (base <= 4664) return roundMoney(base * 0.15 - 381.44);
  return roundMoney(base * 0.225 - 662.77);
}

function calcularRescisao(payload) {
  const salarioBase = toNumber(payload.salarioBase);
  const mediaHorasExtras = toNumber(payload.mediaHorasExtras);
  const mediaAdicionalNoturno = toNumber(payload.mediaAdicionalNoturno);
  const mediaComissoes = toNumber(payload.mediaComissoes);
  const mediaPericulosidade = toNumber(payload.mediaPericulosidade);
  const mediaInsalubridade = toNumber(payload.mediaInsalubridade);
  const outrasMedias = toNumber(payload.outrasMedias);
  const remuneracaoBase = roundMoney(
    salarioBase +
    mediaHorasExtras +
    mediaAdicionalNoturno +
    mediaComissoes +
    mediaPericulosidade +
    mediaInsalubridade +
    outrasMedias
  );

  const diasAviso = calcularAvisoPrevioDias(payload.dataAdmissao, payload.dataDemissao, payload.diasAvisoPrevio);
  const tipoAviso = payload.avisoPrevioTipo || 'indenizado';
  const avisoPrevioValor = tipoAviso === 'indenizado' || tipoAviso === 'dispensa'
    ? roundMoney((remuneracaoBase / 30) * diasAviso)
    : 0;

  const saldoSalario = calcularSaldoSalario(remuneracaoBase, payload.diasTrabalhadosMes, payload.diasNaoPagos);
  const feriasVencidas = calcularFerias(
    remuneracaoBase,
    payload.feriasVencidasQtd,
    String(payload.feriasVencidasEmDobro).toLowerCase() === 'true' || payload.feriasVencidasEmDobro === true
  );

  const mesesFeriasProporcionais = Number(payload.mesesFeriasProporcionais) > 0
    ? Number(payload.mesesFeriasProporcionais)
    : monthsWorkedForProportion(payload.inicioPeriodoAquisitivo || payload.dataAdmissao, payload.dataDemissao);
  const feriasProporcionais = calcularFeriasProporcionais(remuneracaoBase, mesesFeriasProporcionais);

  const mesesDecimoTerceiro = Number(payload.mesesDecimoTerceiro) > 0
    ? Number(payload.mesesDecimoTerceiro)
    : monthsWorkedForProportion(`${new Date(payload.dataDemissao || Date.now()).getFullYear()}-01-01`, payload.dataDemissao);
  const decimoTerceiro = calcularDecimoTerceiro(remuneracaoBase, mesesDecimoTerceiro);
  const adiantamentoDecimoTerceiro = toNumber(payload.adiantamentoDecimoTerceiro);

  const diasIndenizadosExtras = toNumber(payload.diasIndenizadosExtras);
  const indenizacaoDiasExtras = roundMoney((remuneracaoBase / 30) * diasIndenizadosExtras);

  const outrosProventos = toNumber(payload.outrosProventos) + toNumber(payload.valorIndenizacaoManual);
  const outrosDescontos = toNumber(payload.outrosDescontos)
    + toNumber(payload.descontoValeTransporte)
    + toNumber(payload.descontoValeAlimentacao)
    + toNumber(payload.descontoPlanoSaude)
    + toNumber(payload.descontoManual);

  const multaFgts = roundMoney(toNumber(payload.saldoFgts) * (toNumber(payload.percentualMultaFgts || 40) / 100));
  const fgtsMesRescisao = roundMoney((saldoSalario / 100) * 8);
  const fgtsDecimoTerceiro = roundMoney((decimoTerceiro / 100) * 8);
  const fgtsAviso = roundMoney((avisoPrevioValor / 100) * 8);

  const bruto = roundMoney(
    saldoSalario +
    avisoPrevioValor +
    feriasVencidas.total +
    feriasProporcionais.total +
    decimoTerceiro -
    adiantamentoDecimoTerceiro +
    indenizacaoDiasExtras +
    outrosProventos +
    multaFgts
  );

  const baseInss = roundMoney(saldoSalario + decimoTerceiro);
  const inss = payload.descontoInssManual !== undefined && payload.descontoInssManual !== ''
    ? toNumber(payload.descontoInssManual)
    : calcularInssFaixaUnica(baseInss);

  const baseIrrf = roundMoney(baseInss - inss);
  const irrf = payload.descontoIrrfManual !== undefined && payload.descontoIrrfManual !== ''
    ? toNumber(payload.descontoIrrfManual)
    : calcularIrrfSimplificado(baseIrrf);

  const descontos = roundMoney(inss + irrf + outrosDescontos);
  const liquido = roundMoney(bruto - descontos);

  return {
    entradas: payload,
    memoria: {
      remuneracaoBase,
      diasAviso,
      mesesFeriasProporcionais,
      mesesDecimoTerceiro,
      baseInss,
      baseIrrf
    },
    rubricas: {
      saldoSalario,
      avisoPrevioValor,
      feriasVencidasPrincipal: feriasVencidas.principal,
      tercoFeriasVencidas: feriasVencidas.terco,
      feriasProporcionaisPrincipal: feriasProporcionais.principal,
      tercoFeriasProporcionais: feriasProporcionais.terco,
      decimoTerceiro,
      adiantamentoDecimoTerceiro,
      indenizacaoDiasExtras,
      outrosProventos,
      multaFgts,
      fgtsMesRescisao,
      fgtsDecimoTerceiro,
      fgtsAviso,
      inss,
      irrf,
      outrosDescontos
    },
    totais: {
      bruto,
      descontos,
      liquido
    },
    avisos: [
      'Esta primeira versão usa regras-base de rescisão sem justa causa e aceita ajustes manuais.',
      'INSS e IRRF estão simplificados para a primeira versão e devem ser refinados conforme a tabela vigente e a política da empresa.'
    ]
  };
}

module.exports = {
  calcularRescisao,
  calcularAvisoPrevioDias
};
