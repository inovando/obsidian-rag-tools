const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { REFERENCES_DIR } = require('../paths');
const { normalizeRelPath } = require('../rag/vectorStore');

function handleGetPendingReviews(args = {}) {
  const referencesDir = args.targetDir ? path.join(path.resolve(args.targetDir), 'references') : REFERENCES_DIR;
  if (!fs.existsSync(referencesDir)) {
    return { totalPending: 0, vaultTotalPending: 0, limit: 20, offset: 0, hasMore: false, pendingByFolder: {}, pendingNotes: [] };
  }

  const limit = Math.min(50, Math.max(1, parseInt(args.limit || 20, 10)));
  const offset = Math.max(0, parseInt(args.offset || 0, 10));
  const pathPrefix = args.pathPrefix ? normalizeRelPath(args.pathPrefix).toLowerCase() : '';

  const allPending = [];
  const pendingByFolder = {};
  let vaultTotalPending = 0;

  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== '.git' && entry.name !== 'node_modules' && entry.name !== '.obsidian') {
        scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split(/\r?\n/);
        if (lines[0] && lines[0].trim() === '---') {
          const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
          if (endIdx !== -1) {
            try {
              const fm = yaml.load(lines.slice(1, endIdx).join('\n')) || {};
              if (fm.verified_by_reviewer === false) {
                vaultTotalPending++;
                const relPath = normalizeRelPath(path.relative(referencesDir, fullPath));
                
                // Filtro opcional por prefixo de caminho
                if (pathPrefix && !relPath.toLowerCase().startsWith(pathPrefix)) {
                  continue;
                }

                // Estatística agrupada por pasta raiz
                const folder = relPath.includes('/') ? relPath.split('/')[0] : 'raiz';
                pendingByFolder[folder] = (pendingByFolder[folder] || 0) + 1;

                allPending.push({
                  filePath: relPath,
                  topic: fm.topic || 'Sem tópico',
                  tags: fm.tags || [],
                  last_updated: fm.last_updated || 'Não informado'
                });
              }
            } catch {
              // ignora fm inválido
            }
          }
        }
      }
    }
  }
  scan(referencesDir);

  const totalPending = allPending.length;
  const paginatedNotes = allPending.slice(offset, offset + limit);
  const hasMore = offset + limit < totalPending;

  return {
    totalPending,
    vaultTotalPending,
    pathPrefix: args.pathPrefix || null,
    limit,
    offset,
    hasMore,
    pendingByFolder,
    pendingNotes: paginatedNotes
  };
}

module.exports = { handleGetPendingReviews };
