const path = require('path');
const { REFERENCES_DIR } = require('../paths');
const { indexVault } = require('../rag/vectorStore');

async function handleReindexVault(args = {}) {
  const targetDir = args.targetDir ? path.resolve(args.targetDir) : path.resolve(REFERENCES_DIR, '..');
  try {
    const result = await indexVault(targetDir);
    return {
      success: true,
      totalFiles: result.totalFiles,
      totalChunks: result.totalChunks,
      targetDir
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

module.exports = { handleReindexVault };
