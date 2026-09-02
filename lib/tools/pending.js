const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { REFERENCES_DIR } = require('../paths');
const { normalizeRelPath } = require('../rag/vectorStore');

function handleGetPendingReviews(args = {}) {
  const referencesDir = args.targetDir ? path.join(path.resolve(args.targetDir), 'references') : REFERENCES_DIR;
  if (!fs.existsSync(referencesDir)) {
    return { totalPending: 0, pendingNotes: [] };
  }

  const pendingNotes = [];
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== '.git' && entry.name !== 'node_modules') {
        scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split(/\r?\n/);
        if (lines[0].trim() === '---') {
          const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
          if (endIdx !== -1) {
            try {
              const fm = yaml.load(lines.slice(1, endIdx).join('\n')) || {};
              if (fm.verified_by_reviewer === false) {
                const relPath = normalizeRelPath(path.relative(referencesDir, fullPath));
                pendingNotes.push({
                  filePath: relPath,
                  topic: fm.topic || 'Sem tópico',
                  tags: fm.tags || [],
                  last_updated: fm.last_updated || 'Não informado'
                });
              }
            } catch {
              // ignore invalid fm
            }
          }
        }
      }
    }
  }
  scan(referencesDir);

  return {
    totalPending: pendingNotes.length,
    pendingNotes
  };
}

module.exports = { handleGetPendingReviews };
