const path = require('path');
const fs = require('fs');

async function convertFirstPageToImage(pdfPath) {
  let pdf;
  try {
    pdf = require('pdf-poppler');
  } catch (error) {
    throw new Error('Conversão de PDF para imagem indisponível neste ambiente.');
  }

  const outputDir = path.join(path.dirname(pdfPath), 'converted');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const baseName = path.basename(pdfPath, path.extname(pdfPath));
  const opts = {
    format: 'png',
    out_dir: outputDir,
    out_prefix: baseName,
    page: 1,
    scale: 2048
  };

  await pdf.convert(pdfPath, opts);

  const candidate = path.join(outputDir, `${baseName}-1.png`);
  if (fs.existsSync(candidate)) return candidate;

  const fallback = path.join(outputDir, `${baseName}.png`);
  if (fs.existsSync(fallback)) return fallback;

  throw new Error('Não foi possível converter a primeira página do PDF em imagem.');
}

module.exports = { convertFirstPageToImage };
