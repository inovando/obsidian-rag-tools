const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { recordQuery } = require('../metrics');
const { REFERENCES_DIR } = require('../paths');
const { normalizeRelPath } = require('../rag/vectorStore');

function resolveVaultPath(filePath) {
  let cleanRel = normalizeRelPath(filePath);
  let fullPath = path.resolve(REFERENCES_DIR, cleanRel);
  if (!fs.existsSync(fullPath)) {
    // Tenta relativo à raiz do vault
    const vaultRoot = path.resolve(REFERENCES_DIR, '..');
    const altPath = path.resolve(vaultRoot, filePath);
    if (fs.existsSync(altPath)) fullPath = altPath;
  }
  return { fullPath, cleanRel };
}

function extractSectionByHeading(content, targetHeading) {
  const lines = content.split(/\r?\n/);
  const targetLower = targetHeading.toLowerCase().trim();

  let inTarget = false;
  let sectionLines = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const hText = headingMatch[2].toLowerCase().trim();
      if (hText === targetLower || hText.includes(targetLower)) {
        inTarget = true;
        sectionLines.push(line);
      } else if (inTarget) {
        // Encontrou o próximo cabeçalho do mesmo nível ou superior, encerra a seção
        break;
      }
    } else if (inTarget) {
      sectionLines.push(line);
    }
  }

  return sectionLines.join('\n').trim();
}

function handleReadNote(args) {
  const startTime = Date.now();
  const { filePath, heading, startLine, endLine, summaryOnly } = args || {};

  if (!filePath || typeof filePath !== 'string') {
    return { success: false, error: "filePath é obrigatório e deve ser uma string." };
  }

  const { fullPath, cleanRel } = resolveVaultPath(filePath);

  if (!fs.existsSync(fullPath)) {
    return { success: false, error: `Nota não encontrada: ${filePath}` };
  }

  const raw = fs.readFileSync(fullPath, 'utf8');
  const lines = raw.split(/\r?\n/);

  let frontmatter = {};
  let bodyContent = raw;
  let fmEndLine = 0;

  if (lines[0] && lines[0].trim() === '---') {
    const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (endIdx !== -1) {
      try {
        frontmatter = yaml.load(lines.slice(1, endIdx).join('\n')) || {};
      } catch {
        frontmatter = {};
      }
      bodyContent = lines.slice(endIdx + 1).join('\n').trim();
      fmEndLine = endIdx + 1;
    }
  }

  let finalContent = bodyContent;
  let filterApplied = 'full';

  if (summaryOnly) {
    const headings = lines.filter(l => /^#{1,3}\s+/.test(l));
    finalContent = `[Modo Resumo]\nTópico: ${frontmatter.topic || 'N/A'}\nSeções Encontradas:\n` + headings.join('\n');
    filterApplied = 'summaryOnly';
  } else if (heading) {
    const secText = extractSectionByHeading(bodyContent, heading);
    if (secText) {
      finalContent = secText;
      filterApplied = `heading:${heading}`;
    }
  } else if (startLine || endLine) {
    const s = Math.max(1, startLine || 1);
    const e = Math.min(lines.length, endLine || lines.length);
    finalContent = lines.slice(s - 1, e).join('\n');
    filterApplied = `lines:${s}-${e}`;
  }

  const latency = Date.now() - startTime;
  recordQuery(latency, 1, Math.round(finalContent.length / 4));

  return {
    success: true,
    filePath: cleanRel,
    frontmatter,
    content: finalContent,
    filterApplied,
    lineCount: lines.length,
    characterCount: raw.length,
  };
}

module.exports = { handleReadNote };
