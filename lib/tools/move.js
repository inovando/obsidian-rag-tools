const fs = require('fs');
const path = require('path');

const { REFERENCES_DIR } = require('../paths');

function handleMoveNote(args) {
  const { oldFilePath, newFilePath } = args || {};

  if (!oldFilePath || typeof oldFilePath !== 'string') {
    return { success: false, error: "oldFilePath é obrigatório e deve ser uma string." };
  }
  if (!newFilePath || typeof newFilePath !== 'string') {
    return { success: false, error: "newFilePath é obrigatório e deve ser uma string." };
  }

  const oldFullPath = path.resolve(REFERENCES_DIR, oldFilePath);
  const newFullPath = path.resolve(REFERENCES_DIR, newFilePath);

  if (!oldFullPath.startsWith(REFERENCES_DIR)) {
    return { success: false, error: "oldFilePath não pode acessar além do vault." };
  }
  if (!newFullPath.startsWith(REFERENCES_DIR)) {
    return { success: false, error: "newFilePath não pode acessar além do vault." };
  }

  if (!fs.existsSync(oldFullPath)) {
    return { success: false, error: `Nota de origem não encontrada: ${oldFilePath}` };
  }

  const stat = fs.statSync(oldFullPath);
  if (!stat.isFile()) {
    return { success: false, error: `Caminho de origem não é uma nota (arquivo): ${oldFilePath}` };
  }

  const dir = path.dirname(newFullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    fs.renameSync(oldFullPath, newFullPath);
    return { success: true, oldFilePath, newFilePath };
  } catch (err) {
    return { success: false, error: `Erro ao mover arquivo: ${err.message}` };
  }
}

module.exports = { handleMoveNote };
