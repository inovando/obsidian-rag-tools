const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const { WORKSPACE_ROOT } = require('../paths');
const VALIDATOR_PATH = path.join(__dirname, '..', '..', 'validate_vault.js');

function handleValidateVault(args) {
  return new Promise((resolve) => {
    const { targetDir } = args || {};

    let absoluteTargetDir = WORKSPACE_ROOT;

    if (targetDir && typeof targetDir === 'string') {
      absoluteTargetDir = path.resolve(WORKSPACE_ROOT, targetDir);
      
      // Path traversal check: must stay inside WORKSPACE_ROOT
      if (!absoluteTargetDir.startsWith(WORKSPACE_ROOT)) {
        return resolve({
          success: false,
          error: "targetDir não pode acessar além do diretório do projeto."
        });
      }
    }

    if (!fs.existsSync(absoluteTargetDir)) {
      return resolve({
        success: false,
        error: `Diretório alvo não encontrado: ${targetDir || '.'}`
      });
    }

    const spawnArgs = [VALIDATOR_PATH, absoluteTargetDir];
    if (args && args.verbose) {
      spawnArgs.push('--verbose');
    }

    const child = spawn('node', spawnArgs, {
      cwd: WORKSPACE_ROOT
    });

    let stdoutData = '';
    let stderrData = '';

    child.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        success: code === 0,
        exitCode: code,
        stdout: stdoutData,
        stderr: stderrData
      });
    });

    child.on('error', (err) => {
      resolve({
        success: false,
        error: `Erro ao executar validador: ${err.message}`
      });
    });
  });
}

module.exports = { handleValidateVault };
