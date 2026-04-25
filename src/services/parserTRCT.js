const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { tryRepairPdf } = require('./pdfRepair');
const { convertFirstPageToImage } = require('./pdfToImage');
const { extractTextFromImage, normalizeOcrText } = require('./ocrService');

function isKnownPdfStructureError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    msg.includes('bad xref entry') ||
    msg.includes('xref') ||
    msg.includes('invalid pdf') ||
    msg.includes('unknownerrorexception') ||
    msg.includes('invalid xref')
  );
}

function logsToMessages(logs = []) {
  return logs.map((item) => {
    const detalhe = item.stderr ? ` (${String(item.stderr).trim()})` : '';
    return `Tentativa ${item.ferramenta}: ${item.ok ? 'ok' : 'falhou'}${detalhe}`;
  });
}

function hasUsefulText(text = '') {
  const normalized = normalizeOcrText(text);
  return normalized.length >= 20;
}

async function parsePdfBuffer(buffer) {
  const parsed = await pdfParse(buffer);
  const texto = normalizeOcrText(parsed.text || '');

  return {
    ok: true,
    tipoEntrada: 'pdf',
    estrategia: texto ? 'texto-nativo' : 'ocr',
    textoBruto: texto,
    observacoes: texto ? [] : ['PDF sem texto nativo. OCR será tentado.']
  };
}

async function tryOcrFromPdf(filePath, extraObs = []) {
  const imagePath = await convertFirstPageToImage(filePath);
  const text = await extractTextFromImage(imagePath);

  return {
    ok: hasUsefulText(text),
    tipoEntrada: 'pdf',
    estrategia: 'ocr',
    textoBruto: text,
    observacoes: [
      ...extraObs,
      'Texto extraído por OCR a partir da primeira página do PDF.'
    ],
    erroLeitura: hasUsefulText(text)
      ? null
      : {
          codigo: 'OCR_EMPTY',
          mensagem: 'O OCR não conseguiu extrair texto suficiente do PDF.'
        }
  };
}

async function parsePdf(filePath) {
  const buffer = fs.readFileSync(filePath);

  try {
    const parsed = await parsePdfBuffer(buffer);
    if (hasUsefulText(parsed.textoBruto)) return parsed;
    return await tryOcrFromPdf(filePath, parsed.observacoes);
  } catch (error) {
    const repairLogs = [];

    if (isKnownPdfStructureError(error)) {
      const repairResult = await tryRepairPdf(filePath);
      repairLogs.push(...logsToMessages(repairResult.logs || []));

      if (repairResult.repairedPath && fs.existsSync(repairResult.repairedPath)) {
        try {
          const repairedBuffer = fs.readFileSync(repairResult.repairedPath);
          const parsed = await parsePdfBuffer(repairedBuffer);
          if (hasUsefulText(parsed.textoBruto)) {
            return {
              ...parsed,
              observacoes: [
                'O PDF original tinha estrutura interna inconsistente, mas foi reparado automaticamente antes da leitura.',
                ...repairLogs
              ]
            };
          }
          return await tryOcrFromPdf(repairResult.repairedPath, [
            'O PDF original foi reparado automaticamente antes do OCR.',
            ...repairLogs
          ]);
        } catch (repairError) {
          try {
            return await tryOcrFromPdf(filePath, [
              'O reparo automático não bastou; o sistema tentou OCR no arquivo original.',
              ...repairLogs,
              `Erro após reparo: ${repairError.message}`
            ]);
          } catch (ocrError) {
            return {
              ok: false,
              tipoEntrada: 'pdf',
              estrategia: 'revisao-assistida',
              textoBruto: '',
              observacoes: [
                'O PDF foi detectado com estrutura inconsistente.',
                'O reparo automático e o OCR não foram suficientes.',
                ...repairLogs,
                `Erro original: ${error.message}`,
                `Erro após reparo: ${repairError.message}`,
                `Erro no OCR: ${ocrError.message}`
              ],
              erroLeitura: {
                codigo: 'PDF_PARSE_FAILED',
                mensagem: repairError.message
              }
            };
          }
        }
      }
    }

    try {
      return await tryOcrFromPdf(filePath, [
        'A leitura textual falhou; o sistema tentou OCR diretamente no PDF.',
        ...repairLogs,
        `Detalhe técnico inicial: ${error.message}`
      ]);
    } catch (ocrError) {
      return {
        ok: false,
        tipoEntrada: 'pdf',
        estrategia: 'revisao-assistida',
        textoBruto: '',
        observacoes: [
          'O PDF enviado não pôde ser lido automaticamente.',
          'O sistema tentou leitura textual, reparo e OCR antes de desistir.',
          'O ambiente atual não conseguiu concluir a leitura automática completa do PDF.',
          ...repairLogs,
          `Erro principal: ${error.message}`,
          `Erro no OCR: ${ocrError.message}`
        ],
        erroLeitura: {
          codigo: 'PDF_PARSE_FAILED',
          mensagem: error.message
        }
      };
    }
  }
}

async function parseTRCT(filePath, mimeType) {
  const ext = path.extname(filePath).toLowerCase();

  if (mimeType === 'application/pdf' || ext === '.pdf') {
    return parsePdf(filePath);
  }

  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
    const text = await extractTextFromImage(filePath);

    return {
      ok: hasUsefulText(text),
      tipoEntrada: 'imagem',
      estrategia: 'ocr',
      textoBruto: text,
      observacoes: ['Texto extraído por OCR da imagem enviada.'],
      erroLeitura: hasUsefulText(text)
        ? null
        : {
            codigo: 'OCR_EMPTY',
            mensagem: 'O OCR não conseguiu extrair texto suficiente da imagem.'
          }
    };
  }

  throw new Error('Formato de arquivo não suportado. Envie PDF, PNG, JPG, JPEG ou WEBP.');
}

module.exports = { parseTRCT };
