const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
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

function safeExt(originalname = '', mimeType = '') {
  const ext = path.extname(originalname || '').toLowerCase();
  if (ext) return ext;
  if (/pdf/i.test(mimeType)) return '.pdf';
  if (/png/i.test(mimeType)) return '.png';
  if (/jpe?g/i.test(mimeType)) return '.jpg';
  if (/webp/i.test(mimeType)) return '.webp';
  return '';
}

async function writeTempFile(buffer, originalname = 'upload', mimeType = '') {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'trct-import-'));
  const ext = safeExt(originalname, mimeType) || '.bin';
  const filePath = path.join(dir, `arquivo${ext}`);
  await fsp.writeFile(filePath, buffer);
  return { dir, filePath };
}

async function removeTempDir(dir) {
  if (!dir) return;
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
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

async function parsePdfFromFile(filePath, buffer) {
  try {
    const parsed = await parsePdfBuffer(buffer || fs.readFileSync(filePath));
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

async function parsePdfUpload(buffer, originalname, mimeType) {
  let temp = null;
  try {
    // Primeiro tenta ler o PDF direto da memória, sem gravar nada.
    try {
      const parsed = await parsePdfBuffer(buffer);
      if (hasUsefulText(parsed.textoBruto)) return parsed;
    } catch (_error) {
      // Se falhar, cai no fluxo completo abaixo com arquivo temporário.
    }

    // Só cria arquivo temporário quando precisa de reparo/OCR/conversão.
    temp = await writeTempFile(buffer, originalname, mimeType);
    return await parsePdfFromFile(temp.filePath, buffer);
  } finally {
    await removeTempDir(temp?.dir);
  }
}

async function parseImageUpload(buffer, originalname, mimeType) {
  // Tesseract pode ler buffer em muitos ambientes. Se não conseguir, usa arquivo temporário.
  let text = '';
  try {
    text = await extractTextFromImage(buffer);
  } catch (_error) {
    let temp = null;
    try {
      temp = await writeTempFile(buffer, originalname, mimeType);
      text = await extractTextFromImage(temp.filePath);
    } finally {
      await removeTempDir(temp?.dir);
    }
  }

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

async function parseTRCT(input, maybeMimeType) {
  // Compatibilidade com assinatura antiga: parseTRCT(filePath, mimeType)
  if (typeof input === 'string') {
    const filePath = input;
    const mimeType = maybeMimeType || '';
    const ext = path.extname(filePath).toLowerCase();
    if (mimeType === 'application/pdf' || ext === '.pdf') return parsePdfFromFile(filePath);
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      return parseImageUpload(fs.readFileSync(filePath), path.basename(filePath), mimeType);
    }
    throw new Error('Formato de arquivo não suportado. Envie PDF, PNG, JPG, JPEG ou WEBP.');
  }

  const { buffer, mimeType = '', originalname = 'arquivo' } = input || {};
  if (!buffer) throw new Error('Arquivo sem conteúdo para importar.');

  const ext = safeExt(originalname, mimeType);

  if (mimeType === 'application/pdf' || ext === '.pdf') {
    return parsePdfUpload(buffer, originalname, mimeType);
  }

  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
    return parseImageUpload(buffer, originalname, mimeType);
  }

  throw new Error('Formato de arquivo não suportado. Envie PDF, PNG, JPG, JPEG ou WEBP.');
}

module.exports = { parseTRCT };
