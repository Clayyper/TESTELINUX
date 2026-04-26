function normalizeOcrText(text = '') {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractTextFromImage(_imagePath) {
  // OCR opcional: em ambiente Vercel, binários de OCR geralmente não existem.
  // Mantemos a função para o sistema não quebrar; PDFs com texto nativo continuam sendo lidos por pdf-parse.
  try {
    const tesseract = require('tesseract.js');
    const result = await tesseract.recognize(_imagePath, 'por+eng');
    return normalizeOcrText(result?.data?.text || '');
  } catch (_error) {
    return '';
  }
}

module.exports = { extractTextFromImage, normalizeOcrText };
