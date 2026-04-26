const { parseTRCT } = require('../services/parserTRCT');
const { normalizeInformeRendimentos } = require('../services/normalizadorInformeRendimentos');
const { conferirInformeComCalculo } = require('../services/comparadorInformeRendimentos');

function n(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function somaValores(...values) {
  const total = values.reduce((sum, value) => {
    const num = n(value);
    return sum + (num === null ? 0 : num);
  }, 0);
  return Math.round(total * 100) / 100;
}

function mergeUniqueBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  (items || []).forEach((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(item);
  });
  return out;
}

function consolidarInformes(resultados = []) {
  const validos = resultados.filter((item) => item && item.ok !== false);
  const base = validos[0] || resultados[0] || {};

  const totais = {};
  const camposTotais = [
    'rendimentoTributavel',
    'previdenciaOficial',
    'dependente',
    'pensaoAlimenticia',
    'previdenciaPrivadaFapi',
    'deducoesTotal',
    'impostoRetido',
    'rendimentoIsentoSemRetencao',
    'decimoTerceiroRendimento',
    'decimoTerceiroImpostoRetido'
  ];

  camposTotais.forEach((campo) => {
    totais[campo] = somaValores(...validos.map((item) => item.totais?.[campo]));
  });

  const fontesPagadoras = mergeUniqueBy(
    validos.flatMap((item) => item.fontesPagadoras || []),
    (item) => `${item.cnpj || ''}|${item.nome || ''}`
  );

  const codigosReceita = validos.flatMap((item) =>
    (item.codigosReceita || []).map((codigo) => ({
      ...codigo,
      arquivo: item.arquivo?.nome || null
    }))
  );

  const observacoes = resultados.flatMap((item) => item.observacoes || []);
  const arquivosComErro = resultados.filter((item) => item.ok === false);
  const anos = mergeUniqueBy(validos.map((item) => item.anoCalendario).filter(Boolean), (item) => String(item));

  return {
    ok: arquivosComErro.length === 0,
    lote: true,
    quantidadeArquivos: resultados.length,
    quantidadeLidos: validos.length,
    quantidadeComErro: arquivosComErro.length,
    arquivos: resultados.map((item) => ({
      nome: item.arquivo?.nome || 'sem nome',
      ok: item.ok !== false,
      anoCalendario: item.anoCalendario || null,
      modelo: item.modelo || null,
      estrategia: item.estrategia || null,
      totais: item.totais || {},
      erroLeitura: item.erroLeitura || null
    })),
    arquivo: {
      nome: resultados.length === 1 ? (resultados[0].arquivo?.nome || 'arquivo único') : `${resultados.length} arquivos importados`,
      tipo: 'lote',
      tamanho: resultados.reduce((sum, item) => sum + (Number(item.arquivo?.tamanho) || 0), 0)
    },
    origem: 'lote-e-cac',
    estrategia: validos.some((item) => item.estrategia === 'ocr') ? 'texto-nativo+ocr' : (base.estrategia || 'texto-nativo'),
    observacoes,
    modelo: {
      modelId: 'ECAC_FONTES_PAGADORAS_LOTE',
      modelLabel: 'e-CAC / Fontes Pagadoras - Lote de Informes',
      confidence: validos.length ? Math.min(...validos.map((item) => Number(item.modelo?.confidence || 0))) : 0
    },
    beneficiario: base.beneficiario || {},
    anoCalendario: anos.length === 1 ? anos[0] : (anos.length ? anos.join(', ') : null),
    anosCalendario: anos,
    dataProcessamento: base.dataProcessamento || null,
    fontesPagadoras,
    codigosReceita,
    totais,
    indicadores: {
      mediaMensalTributavel: totais.rendimentoTributavel === null ? null : somaValores(totais.rendimentoTributavel / 12),
      totalRetencoes: somaValores(totais.previdenciaOficial, totais.impostoRetido, totais.decimoTerceiroImpostoRetido),
      rendimentoTotalCom13: somaValores(totais.rendimentoTributavel, totais.decimoTerceiroRendimento)
    }
  };
}

async function parseArquivo(file) {
  const parsed = await parseTRCT({
    buffer: file.buffer,
    mimeType: file.mimetype,
    originalname: file.originalname
  });

  const normalized = normalizeInformeRendimentos(parsed);
  return {
    ok: parsed.ok !== false,
    arquivo: {
      nome: file.originalname,
      tipo: file.mimetype,
      tamanho: file.size
    },
    ...normalized,
    erroLeitura: parsed.erroLeitura || null
  };
}

async function importarInforme(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'Nenhum arquivo enviado.' });
    const resultado = await parseArquivo(req.file);
    const statusCode = resultado.ok === false ? 422 : 200;
    return res.status(statusCode).json(resultado);
  } catch (error) {
    return next(error);
  }
}

async function importarInformeLote(req, res, next) {
  try {
    const files = req.files || (req.file ? [req.file] : []);
    if (!files.length) return res.status(400).json({ ok: false, error: 'Nenhum arquivo enviado.' });

    const resultados = [];
    for (const file of files) {
      try {
        resultados.push(await parseArquivo(file));
      } catch (error) {
        resultados.push({
          ok: false,
          arquivo: { nome: file.originalname, tipo: file.mimetype, tamanho: file.size },
          erroLeitura: { codigo: 'ERRO_IMPORTACAO', mensagem: error.message || 'Falha ao importar arquivo.' },
          observacoes: [`Falha ao importar ${file.originalname}: ${error.message || 'erro desconhecido'}`],
          totais: {},
          fontesPagadoras: [],
          codigosReceita: []
        });
      }
    }

    const consolidado = consolidarInformes(resultados);
    const statusCode = consolidado.quantidadeLidos ? 200 : 422;
    return res.status(statusCode).json(consolidado);
  } catch (error) {
    return next(error);
  }
}

function conferirInforme(req, res) {
  const { calculado, calculo, informe } = req.body || {};
  const baseCalculo = calculado || calculo;
  if (!informe) return res.status(400).json({ ok: false, error: 'Informe e-CAC não informado.' });
  const conferencia = conferirInformeComCalculo(baseCalculo || {}, informe);
  return res.json({ ok: true, ...conferencia });
}

module.exports = { importarInforme, importarInformeLote, conferirInforme, consolidarInformes };
