const fs = require('fs');
const path = require('path');

const { REFERENCES_DIR } = require('../paths');
const { updateNoteInIndex, normalizeRelPath } = require('../rag/vectorStore');

async function handleMoveNote(args) {
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

    // R5: Atualizar o índice vetorial ao mover a nota
    const targetDir = path.resolve(REFERENCES_DIR, '..');
    const cleanOld = normalizeRelPath(oldFilePath);
    const cleanNew = normalizeRelPath(newFilePath);

    // 1) Remover chunks do caminho antigo
    await updateNoteInIndex(targetDir, cleanOld, '');

    // 2) Indexar chunks no novo caminho
    if (fs.existsSync(newFullPath)) {
      const newContent = fs.readFileSync(newFullPath, 'utf8');
      await updateNoteInIndex(targetDir, cleanNew, newContent);
    }

    return { success: true, oldFilePath: cleanOld, newFilePath: cleanNew };
  } catch (err) {
    return { success: false, error: `Erro ao mover arquivo: ${err.message}` };
  }
}

module.exports = { handleMoveNote };
