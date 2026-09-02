const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { REFERENCES_DIR } = require('../paths');
const { buildFullContent } = require('./write');

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function importRepository(sourceDir, targetVaultDir) {
  const vaultRoot = targetVaultDir ? path.resolve(targetVaultDir) : path.resolve(REFERENCES_DIR, '..');
  const targetRefDir = path.join(vaultRoot, 'references');

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Diretório de origem não encontrado: ${sourceDir}`);
  }

  const filesToProcess = [];
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '.git' && entry.name !== 'node_modules' && entry.name !== '.obsidian') {
          scan(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        if (entry.name.toLowerCase() !== 'readme.md' && entry.name.toLowerCase() !== 'changelog.md') {
          filesToProcess.push(fullPath);
        }
      }
    }
  }
  scan(sourceDir);

  let importedFiles = 0;
  let totalNotesCreated = 0;

  for (const file of filesToProcess) {
    const relFromSource = path.relative(sourceDir, file);
    const content = fs.readFileSync(file, 'utf8');
    if (!content.trim()) continue;

    const baseName = path.basename(file, '.md');
    const folderName = path.dirname(relFromSource).replace(/\\/g, '/');
    const destFolder = path.join(targetRefDir, 'imported', folderName);
    if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true });

    // Extrai ou constrói o tópico
    let topic = baseName.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    let tags = ['imported', slugify(folderName.split('/')[0] || 'general')];
    let sources = [relFromSource];
    let body = content;

    // Se já tinha frontmatter, reaproveita
    const lines = content.split(/\r?\n/);
    if (lines[0].trim() === '---') {
      const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
      if (endIdx !== -1) {
        try {
          const fm = yaml.load(lines.slice(1, endIdx).join('\n')) || {};
          if (fm.topic) topic = fm.topic;
          if (Array.isArray(fm.tags)) tags = [...new Set([...tags, ...fm.tags])];
          if (Array.isArray(fm.sources)) sources = [...new Set([...sources, ...fm.sources])];
          body = lines.slice(endIdx + 1).join('\n');
        } catch {
          // usa os valores default
        }
      }
    }

    const bodyLines = body.split(/\r?\n/);

    // Se a nota tiver mais de 180 linhas, faz split por seções
    if (bodyLines.length > 180) {
      const subNotes = [];
      let currentHeading = topic;
      let currentLines = [];

      for (const line of bodyLines) {
        if (/^#{1,2}\s+/.test(line)) {
          if (currentLines.length > 0) {
            subNotes.push({ heading: currentHeading, content: currentLines.join('\n') });
          }
          currentHeading = line.replace(/^#{1,2}\s+/, '').trim();
          currentLines = [line];
        } else {
          currentLines.push(line);
        }
      }
      if (currentLines.length > 0) {
        subNotes.push({ heading: currentHeading, content: currentLines.join('\n') });
      }

      // Salva as sub-notas modulares conectadas por wiki-links
      subNotes.forEach((sub, idx) => {
        const subFileName = `${slugify(baseName)}-parte-${idx + 1}.md`;
        const subFilePath = path.join(destFolder, subFileName);

        const nextLink = idx < subNotes.length - 1 ? `\n\nPróxima seção: [[${slugify(baseName)}-parte-${idx + 2}]]` : '';
        const prevLink = idx > 0 ? `\n\nSeção anterior: [[${slugify(baseName)}-parte-${idx}]]\n` : '';

        const subBody = `${prevLink}${sub.content}${nextLink}`;
        const fm = {
          topic: `${topic} - ${sub.heading}`,
          tags,
          sources,
          verified_by_reviewer: false,
          last_updated: new Date().toISOString()
        };

        const fullContent = buildFullContent(fm, subBody);
        fs.writeFileSync(subFilePath, fullContent, 'utf8');
        totalNotesCreated++;
      });
    } else {
      const destFilePath = path.join(destFolder, `${slugify(baseName)}.md`);
      const fm = {
        topic,
        tags,
        sources,
        verified_by_reviewer: false,
        last_updated: new Date().toISOString()
      };

      const fullContent = buildFullContent(fm, body);
      fs.writeFileSync(destFilePath, fullContent, 'utf8');
      totalNotesCreated++;
    }

    importedFiles++;
  }

  return { sourceDir, importedFiles, totalNotesCreated };
}

module.exports = { importRepository };
