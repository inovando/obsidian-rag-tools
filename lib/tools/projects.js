const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { REFERENCES_DIR } = require('../paths');
const { normalizeRelPath } = require('../rag/vectorStore');

function extractFrontmatter(content) {
  const lines = content.split('\n');
  if (lines[0].trim() !== '---') return { fm: {}, body: content };
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end === -1) return { fm: {}, body: content };
  try {
    const fm = yaml.load(lines.slice(1, end).join('\n')) || {};
    const body = lines.slice(end + 1).join('\n').trim();
    return { fm, body };
  } catch {
    return { fm: {}, body: content };
  }
}

function handleListProjects(args = {}) {
  const referencesDir = args.targetDir ? path.resolve(args.targetDir, 'references') : REFERENCES_DIR;
  if (!fs.existsSync(referencesDir)) {
    return { success: false, error: 'Diretório references não encontrado.' };
  }

  const projects = [];

  function scanFolder(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.obsidian' || entry.name === '_shared') continue;

      const folderPath = path.join(dir, entry.name);
      const folderRelPath = normalizeRelPath(path.relative(referencesDir, folderPath));

      // Scan todos os arquivos .md dentro desta pasta
      const mdFiles = [];
      function getMdFiles(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) getMdFiles(p);
          else if (e.isFile() && e.name.endsWith('.md')) mdFiles.push(p);
        }
      }
      getMdFiles(folderPath);

      if (mdFiles.length === 0) continue;

      // Verifica se é pasta de projeto (começa com proj-, projects/, ou possui _project.md / _anchor.md / meta/project)
      let anchorFile = mdFiles.find(f => {
        const bn = path.basename(f).toLowerCase();
        return bn === '_project.md' || bn === '_anchor.md' || bn === 'overview.md';
      });

      let isProjectFolder = entry.name.startsWith('proj-') || entry.name === 'projects' || !!anchorFile;

      let fm = {};
      let firstHeader = '';

      if (anchorFile) {
        try {
          const content = fs.readFileSync(anchorFile, 'utf8');
          const parsed = extractFrontmatter(content);
          fm = parsed.fm;
          const hMatch = parsed.body.match(/^#+\s+(.+)$/m);
          if (hMatch) firstHeader = hMatch[1].trim();
        } catch {
          // Ignore
        }
      } else {
        // Tenta achar primeira nota com frontmatter
        for (const f of mdFiles) {
          try {
            const content = fs.readFileSync(f, 'utf8');
            const parsed = extractFrontmatter(content);
            if (parsed.fm && (parsed.fm.tags || []).some(t => String(t).includes('meta/project') || String(t).startsWith('proj-'))) {
              isProjectFolder = true;
              anchorFile = f;
              fm = parsed.fm;
              const hMatch = parsed.body.match(/^#+\s+(.+)$/m);
              if (hMatch) firstHeader = hMatch[1].trim();
              break;
            }
          } catch {
            // Ignore
          }
        }
      }

      if (isProjectFolder) {
        const slug = entry.name.replace(/^proj-/, '');
        const anchorRelPath = anchorFile ? normalizeRelPath(path.relative(referencesDir, anchorFile)) : null;

        projects.push({
          slug,
          folderName: entry.name,
          relativePath: folderRelPath,
          anchorNote: anchorRelPath,
          title: fm.topic || firstHeader || entry.name,
          tags: fm.tags || [`proj-${slug}`],
          noteCount: mdFiles.length
        });
      }
    }
  }

  scanFolder(referencesDir);

  // Ordena por quantidade de notas e slug
  projects.sort((a, b) => b.noteCount - a.noteCount);

  return {
    success: true,
    totalProjects: projects.length,
    projects
  };
}

module.exports = { handleListProjects };
