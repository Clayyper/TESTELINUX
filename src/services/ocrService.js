function normalizeOcrText(text = '') {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractTextFromImage(imageInput) {
  // OCR opcional. No Vercel pode funcionar com tesseract.js puro,
  // mas não depende de pasta persistente. Retorna vazio se OCR não estiver disponível.
  try {
    const tesseract = require('tesseract.js');
    const result = await tesseract.recognize(imageInput, 'por+eng');
    return normalizeOcrText(result?.data?.text || '');
  } catch (_error) {
    return '';
  }
}

module.exports = { extractTextFromImage, normalizeOcrText };
