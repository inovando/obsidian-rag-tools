const fs = require('fs');
const path = require('path');

const { REFERENCES_DIR } = require('../paths');

function handleDeleteNote(args) {
  const { filePath } = args || {};

  if (!filePath || typeof filePath !== 'string') {
    return { success: false, error: "filePath é obrigatório e deve ser uma string." };
  }

  const fullPath = path.resolve(REFERENCES_DIR, filePath);

  if (!fullPath.startsWith(REFERENCES_DIR)) {
    return { success: false, error: "filePath não pode acessar além do vault." };
  }

  if (!fs.existsSync(fullPath)) {
    return { success: false, error: `Nota não encontrada: ${filePath}` };
  }

  const stat = fs.statSync(fullPath);
  if (!stat.isFile()) {
    return { success: false, error: `Caminho não é uma nota (arquivo): ${filePath}` };
  }

  try {
    fs.unlinkSync(fullPath);
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: `Erro ao remover arquivo: ${err.message}` };
  }
}

module.exports = { handleDeleteNote };
