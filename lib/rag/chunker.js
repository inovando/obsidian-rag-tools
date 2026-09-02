const yaml = require('js-yaml');

/**
 * Extrai o frontmatter YAML de uma nota markdown.
 */
function parseFrontmatter(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0].trim() !== '---') return { frontmatter: {}, body: content, fmEndLine: 0 };
  const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (endIdx === -1) return { frontmatter: {}, body: content, fmEndLine: 0 };

  const fmText = lines.slice(1, endIdx).join('\n');
  let frontmatter = {};
  try {
    frontmatter = yaml.load(fmText) || {};
  } catch (e) {
    frontmatter = {};
  }

  const body = lines.slice(endIdx + 1).join('\n');
  return { frontmatter, body, fmEndLine: endIdx + 1 };
}

/**
 * Divide o conteúdo markdown de uma nota em chunks por seções (headings #, ##, ###).
 */
function chunkNote(filePath, content) {
  const { frontmatter, body, fmEndLine } = parseFrontmatter(content);
  const topic = frontmatter.topic || '';
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];

  const lines = content.split(/\r?\n/);
  const bodyLines = lines.slice(fmEndLine);

  const sections = [];
  let currentHeading = 'Visão Geral';
  let currentLines = [];
  let startLineNum = fmEndLine + 1;

  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i];
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);

    if (headingMatch) {
      if (currentLines.length > 0 && currentLines.join('\n').trim().length > 0) {
        sections.push({
          heading: currentHeading,
          content: currentLines.join('\n').trim(),
          startLine: startLineNum,
          endLine: fmEndLine + i,
        });
      }
      currentHeading = headingMatch[2].trim();
      currentLines = [line];
      startLineNum = fmEndLine + i + 1;
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0 && currentLines.join('\n').trim().length > 0) {
    sections.push({
      heading: currentHeading,
      content: currentLines.join('\n').trim(),
      startLine: startLineNum,
      endLine: lines.length,
    });
  }

  // Se não houver seções separadas por heading, trata a nota inteira como 1 chunk
  if (sections.length === 0 && body.trim().length > 0) {
    sections.push({
      heading: 'Conteúdo Principal',
      content: body.trim(),
      startLine: fmEndLine + 1,
      endLine: lines.length,
    });
  }

  const chunks = [];
  sections.forEach((sec, idx) => {
    // Para trechos muito longos (> 1200 caracteres), podemos subdividir se necessário
    const secContent = sec.content;
    const textToEmbed = `Tópico: ${topic}\nTags: ${tags.join(', ')}\nSeção: ${sec.heading}\nCaminho: ${filePath}\n\n${secContent}`;

    chunks.push({
      chunkId: `${filePath}#chunk-${idx + 1}`,
      filePath,
      heading: sec.heading,
      topic,
      tags,
      startLine: sec.startLine,
      endLine: sec.endLine,
      content: secContent,
      textToEmbed
    });
  });

  return chunks;
}

module.exports = {
  parseFrontmatter,
  chunkNote
};
