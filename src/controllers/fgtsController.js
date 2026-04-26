'use strict';

const { parseTRCT } = require('../services/parserTRCT');
const { normalizeFGTS } = require('../services/normalizadorFGTS');

function roundMoney(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

async function importarUmArquivo(file) {
  const parsed = await parseTRCT({
    buffer: file.buffer,
    mimeType: file.mimetype,
    originalname: file.originalname
  });
  return normalizeFGTS(parsed, file);
}

async function importarFGTS(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'Nenhum arquivo enviado.' });
    const fgts = await importarUmArquivo(req.file);
    return res.status(fgts.ok ? 200 : 422).json(fgts);
  } catch (error) {
    return next(error);
  }
}

async function importarFGTSLote(req, res, next) {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ ok: false, error: 'Nenhum arquivo enviado.' });

    const resultados = [];
    for (const file of files) {
      try {
        const item = await importarUmArquivo(file);
        resultados.push(item);
      } catch (error) {
        resultados.push({ ok: false, arquivo: { nome: file.originalname, tipo: file.mimetype, tamanho: file.size }, saldo: null, multaEsperada: null, observacoes: [error.message || 'Falha ao ler arquivo FGTS.'] });
      }
    }

    const lidos = resultados.filter((r) => r.ok && r.saldo !== null);
    const saldoTotal = roundMoney(lidos.reduce((acc, r) => acc + Number(r.saldo || 0), 0));
    const multaEsperada = roundMoney(saldoTotal * 0.4);

    const payload = {
      ok: lidos.length > 0,
      lote: true,
      quantidadeArquivos: resultados.length,
      quantidadeLidos: lidos.length,
      quantidadeComErro: resultados.length - lidos.length,
      origem: 'importado-lote',
      saldo: lidos.length ? saldoTotal : null,
      multaEsperada: lidos.length ? multaEsperada : null,
      arquivos: resultados.map((r) => ({ ok: !!r.ok, nome: r.arquivo?.nome || 'arquivo-fgts', saldo: r.saldo, multaEsperada: r.multaEsperada, encontradoPor: r.encontradoPor || null, observacoes: r.observacoes || [] })),
      observacoes: [
        `${lidos.length} de ${resultados.length} arquivo(s) tiveram saldo FGTS localizado.`,
        ...(lidos.length ? [`Saldo FGTS consolidado: ${saldoTotal}.`] : ['Não foi possível localizar saldo FGTS em nenhum arquivo.'])
      ]
    };

    return res.status(payload.ok ? 200 : 422).json(payload);
  } catch (error) {
    return next(error);
  }
}

module.exports = { importarFGTS, importarFGTSLote };
