const Tesseract = require('tesseract.js');

function normalizeOcrText(text = '') {
  return String(text)
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

async function extractTextFromImage(imagePath) {
  const result = await Tesseract.recognize(imagePath, 'por+eng', {
    logger: () => {}
  });

  return normalizeOcrText(result?.data?.text || '');
}

module.exports = {
  extractTextFromImage,
  normalizeOcrText
};
