const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { recordWrite, recordValidationError } = require('../metrics');
const { REFERENCES_DIR } = require('../paths');
const { updateNoteInIndex } = require('../rag/vectorStore');

function isValidISODate(dateStr) {
  if (typeof dateStr !== 'string') return false;
  const basic = /^\d{4}-\d{2}-\d{2}$/;
  const dateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
  if (!basic.test(dateStr) && !dateTime.test(dateStr)) return false;
  return !isNaN(new Date(dateStr).getTime());
}

function resolveFilePath(filePath) {
  let relPath = filePath.replace(/\\/g, '/');
  if (relPath.startsWith('references/')) {
    relPath = relPath.slice('references/'.length);
  }
  const fullPath = path.resolve(REFERENCES_DIR, relPath);
  return { fullPath, relPath };
}

function vaultFilesSet() {
  const files = new Set();
  const base = path.resolve(REFERENCES_DIR, '..');
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && e.name !== '.git' && e.name !== 'node_modules' && e.name !== '.agents') walk(p);
      else if (e.isFile()) files.add(p);
    }
  }
  walk(base);
  return files;
}

function validateContent(content, filePath) {
  const errors = [];
  const lines = content.split(/\r?\n/);

  if (lines.length > 200) {
    errors.push('exceeds line limit of 200 lines');
  }

  if (lines[0].trim() !== '---') { errors.push('Missing YAML frontmatter'); return errors; }
  const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (endIdx === -1) { errors.push('Missing YAML frontmatter closing'); return errors; }

  const fmText = lines.slice(1, endIdx).join('\n');
  let fm = {};
  try { fm = yaml.load(fmText) || {}; }
  catch (e) { errors.push('YAML syntax error: ' + e.message); return errors; }

  if (!fm.topic || typeof fm.topic !== 'string') errors.push('topic must be a non-empty string');
  if (!Array.isArray(fm.tags)) errors.push('tags must be an array');
  else if (fm.tags.length === 0) errors.push('tags must contain at least one tag');
  else if (!fm.tags.every(t => typeof t === 'string')) errors.push('tags must only contain strings');
  if (!Array.isArray(fm.sources)) errors.push('sources must be an array');
  else if (fm.sources.length === 0) errors.push('sources must contain at least one source');
  else if (!fm.sources.every(s => typeof s === 'string')) errors.push('sources must only contain strings');
  if (typeof fm.verified_by_reviewer !== 'boolean') errors.push('verified_by_reviewer must be a boolean');
  if (fm.last_updated && !isValidISODate(fm.last_updated)) errors.push('last_updated must be a valid ISO-8601 date');

  const bodyText = lines.slice(endIdx + 1).join('\n');
  if (/\bTODO\b/i.test(bodyText)) errors.push("contains placeholder: 'TODO'");
  if (/\bTBD\b/i.test(bodyText)) errors.push("contains placeholder: 'TBD'");

  const cleanBody = bodyText.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*?`/g, '');
  const vaultFiles = vaultFilesSet();
  const wikiLinkRegex = /\[\[(.*?)\]\]/g;
  let m;
  while ((m = wikiLinkRegex.exec(cleanBody)) !== null) {
    const target = m[1].split('|')[0].split('#')[0].trim();
    if (!target) continue;
    const targetFile = target.endsWith('.md') ? target : target + '.md';
    const resolved = path.resolve(path.dirname(path.resolve(REFERENCES_DIR, '..', filePath)), targetFile);
    if (!vaultFiles.has(resolved) && !target.startsWith('http')) {
      errors.push("Broken wiki-link: [[" + target + "]]");
    }
  }

  return errors;
}

/**
 * Monta o documento final ajustando linha por linha e garantindo contagem exata de linhas e caracteres no token_density.
 */
function buildFullContent(fm, bodyContent) {
  const fmLines = ['---'];
  fmLines.push('topic: ' + JSON.stringify(fm.topic));
  if (fm.tags) fmLines.push('tags: ' + JSON.stringify(fm.tags));
  if (fm.sources) fmLines.push('sources: ' + JSON.stringify(fm.sources));
  fmLines.push('verified_by_reviewer: ' + (fm.verified_by_reviewer === true));
  fmLines.push('last_updated: ' + JSON.stringify(fm.last_updated || new Date().toISOString()));

  // Placeholders para token_density
  fmLines.push('token_density:');
  fmLines.push('  line_count: 0');
  fmLines.push('  character_count: 0');
  fmLines.push('---');

  const bodyStr = bodyContent ? bodyContent.trim() : '';
  let fullText = fmLines.join('\n') + (bodyStr ? '\n' + bodyStr : '');

  // Pass 1: ajustar line_count e char_count inicial
  const lines = fullText.split('\n');
  const lineCount = lines.length;
  let charCount = fullText.length;

  fullText = fullText.replace(/^(\s*line_count\s*:\s*)\d+/m, `$1${lineCount}`);
  fullText = fullText.replace(/^(\s*character_count\s*:\s*)\d+/m, `$1${charCount}`);

  // Pass 2: ajustar char_count final para bater com o tamanho exato da string atualizada
  charCount = fullText.length;
  fullText = fullText.replace(/^(\s*character_count\s*:\s*)\d+/m, `$1${charCount}`);

  return fullText;
}

async function handleWriteNote(args) {
  const { filePath, topic, tags, sources, content } = args;

  const { fullPath, relPath } = resolveFilePath(filePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const fm = {
    topic,
    tags,
    sources,
    verified_by_reviewer: false,
    last_updated: new Date().toISOString()
  };

  const finalContent = buildFullContent(fm, content);

  const errors = validateContent(finalContent, relPath);
  if (errors.length > 0) {
    recordValidationError();
    return { success: false, errors };
  }

  fs.writeFileSync(fullPath, finalContent, 'utf8');
  recordWrite();

  // Atualização incremental assíncrona do índice vetorial
  const targetDir = path.resolve(REFERENCES_DIR, '..');
  updateNoteInIndex(targetDir, relPath, finalContent).catch(() => {});

  const lineCount = finalContent.split('\n').length;
  return { success: true, lineCount, filePath: relPath };
}

module.exports = { handleWriteNote, buildFullContent };
