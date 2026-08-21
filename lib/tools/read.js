const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { recordQuery } = require('../metrics');

const { REFERENCES_DIR } = require('../paths');

function handleReadNote(args) {
  const startTime = Date.now();
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

  const raw = fs.readFileSync(fullPath, 'utf8');
  const lines = raw.split('\n');

  let frontmatter = {};
  let content = raw;

  if (lines[0] && lines[0].trim() === '---') {
    const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (endIdx !== -1) {
      try {
        frontmatter = yaml.load(lines.slice(1, endIdx).join('\n')) || {};
      } catch {
        frontmatter = {};
      }
      content = lines.slice(endIdx + 1).join('\n').trim();
    }
  }

  const latency = Date.now() - startTime;
  recordQuery(latency, 1, Math.round(content.length / 4));

  return {
    success: true,
    filePath,
    frontmatter,
    content,
    lineCount: lines.length,
    characterCount: raw.length,
  };
}

module.exports = { handleReadNote };
