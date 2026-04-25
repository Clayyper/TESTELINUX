const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error) => {
      resolve({ ok: false, stdout, stderr: error.message, command, args });
    });

    child.on('close', (code) => {
      resolve({ ok: code === 0, stdout, stderr, command, args });
    });
  });
}

async function tryRepairPdf(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  const repairedPath = path.join(dir, `${base}.repaired.pdf`);

  if (fs.existsSync(repairedPath)) {
    fs.unlinkSync(repairedPath);
  }

  const attempts = [
    {
      cmd: process.env.QPDF_PATH || 'qpdf',
      args: ['--linearize', filePath, repairedPath],
      label: 'qpdf --linearize'
    },
    {
      cmd: process.env.MUTOOL_PATH || 'mutool',
      args: ['clean', '-d', filePath, repairedPath],
      label: 'mutool clean -d'
    }
  ];

  const logs = [];

  for (const attempt of attempts) {
    const result = await runCommand(attempt.cmd, attempt.args);
    logs.push({
      ferramenta: attempt.label,
      executavel: attempt.cmd,
      ok: result.ok,
      stderr: result.stderr || ''
    });

    if (result.ok && fs.existsSync(repairedPath)) {
      return { repairedPath, logs };
    }
  }

  return { repairedPath: null, logs };
}

module.exports = { tryRepairPdf };
