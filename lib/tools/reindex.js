const path = require('path');
const { REFERENCES_DIR } = require('../paths');
const { indexVault, syncIndexWithDisk, loadVectorStore } = require('../rag/vectorStore');

async function handleReindexVault(args = {}) {
  const targetDir = args.targetDir ? path.resolve(args.targetDir) : path.resolve(REFERENCES_DIR, '..');
  const force = args.force === true;
  try {
    if (force) {
      const result = await indexVault(targetDir);
      return {
        success: true,
        mode: 'full',
        totalFiles: result.totalFiles,
        totalChunks: result.totalChunks,
        targetDir
      };
    } else {
      const syncResult = await syncIndexWithDisk(targetDir);
      const store = loadVectorStore(targetDir);
      return {
        success: true,
        mode: 'incremental',
        updatedFilesCount: syncResult.syncedCount,
        updatedFiles: syncResult.updatedFiles,
        purgedFiles: syncResult.purgedFiles,
        totalChunks: (store.chunks || []).length,
        targetDir
      };
    }
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

module.exports = { handleReindexVault };
