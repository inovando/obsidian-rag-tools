const path = require('path');
const fs = require('fs');

/**
 * Resolve o diretório raiz do vault Obsidian.
 * 1. Verifica variáveis de ambiente (OBSIDIAN_VAULT_PATH ou VAULT_PATH).
 * 2. Verifica se o diretório atual de execução (process.cwd()) contém as pastas de vault.
 * 3. Usa o próprio diretório do pacote como fallback.
 */
function resolveVaultRoot() {
  if (process.env.OBSIDIAN_VAULT_PATH) {
    return path.resolve(process.env.OBSIDIAN_VAULT_PATH);
  }
  if (process.env.VAULT_PATH) {
    return path.resolve(process.env.VAULT_PATH);
  }

  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'templates')) || fs.existsSync(path.join(cwd, 'references'))) {
    return cwd;
  }

  return path.resolve(__dirname, '..');
}

const WORKSPACE_ROOT = resolveVaultRoot();
const REFERENCES_DIR = path.join(WORKSPACE_ROOT, 'references');
const TEMPLATES_DIR = path.join(WORKSPACE_ROOT, 'templates');

module.exports = {
  WORKSPACE_ROOT,
  REFERENCES_DIR,
  TEMPLATES_DIR
};
