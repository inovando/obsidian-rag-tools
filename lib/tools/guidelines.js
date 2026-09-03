const fs = require('fs');
const path = require('path');
const { REFERENCES_DIR } = require('../paths');

function getGuidelinesDir(targetDir) {
  const vaultRoot = targetDir || path.resolve(REFERENCES_DIR, '..');
  return path.join(vaultRoot, '.agents', 'guidelines');
}

function handleManageGuidelines(args = {}) {
  const { action = 'list', type = 'global', name = 'code-style', content } = args;
  const baseDir = getGuidelinesDir(args.targetDir);

  const langDir = path.join(baseDir, 'languages');
  const projDir = path.join(baseDir, 'projects');

  if (!fs.existsSync(langDir)) fs.mkdirSync(langDir, { recursive: true });
  if (!fs.existsSync(projDir)) fs.mkdirSync(projDir, { recursive: true });

  if (action === 'list') {
    const guidelines = [];

    // 1. Arquivos globais na raiz de .agents/guidelines/
    for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        guidelines.push({
          type: 'global',
          name: entry.name.replace(/\.md$/, ''),
          path: path.relative(path.resolve(REFERENCES_DIR, '..'), path.join(baseDir, entry.name))
        });
      }
    }

    // 2. Diretrizes por Linguagem
    if (fs.existsSync(langDir)) {
      for (const entry of fs.readdirSync(langDir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          guidelines.push({
            type: 'language',
            name: entry.name.replace(/\.md$/, ''),
            path: path.relative(path.resolve(REFERENCES_DIR, '..'), path.join(langDir, entry.name))
          });
        }
      }
    }

    // 3. Diretrizes por Projeto
    if (fs.existsSync(projDir)) {
      for (const entry of fs.readdirSync(projDir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          guidelines.push({
            type: 'project',
            name: entry.name.replace(/\.md$/, ''),
            path: path.relative(path.resolve(REFERENCES_DIR, '..'), path.join(projDir, entry.name))
          });
        }
      }
    }

    return { guidelines };
  }

  function resolvePath() {
    if (type === 'language') return path.join(langDir, `${name}.md`);
    if (type === 'project') return path.join(projDir, `${name}.md`);
    return path.join(baseDir, `${name}.md`);
  }

  const targetPath = resolvePath();

  if (action === 'read') {
    if (!fs.existsSync(targetPath)) {
      return { success: false, error: `Diretriz '${name}' (tipo: ${type}) não encontrada em .agents/guidelines/` };
    }
    const fileContent = fs.readFileSync(targetPath, 'utf8');
    return {
      success: true,
      type,
      name,
      content: fileContent,
      path: path.relative(path.resolve(REFERENCES_DIR, '..'), targetPath)
    };
  }

  if (action === 'write') {
    if (!content) return { success: false, error: 'content é obrigatório para gravação de diretriz' };

    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(targetPath, content, 'utf8');
    return {
      success: true,
      type,
      name,
      message: `Diretriz '${name}' (tipo: ${type}) salva com sucesso em .agents/guidelines/`,
      path: path.relative(path.resolve(REFERENCES_DIR, '..'), targetPath)
    };
  }

  if (action === 'delete') {
    if (!fs.existsSync(targetPath)) {
      return { success: false, error: `Diretriz '${name}' (tipo: ${type}) não encontrada em .agents/guidelines/` };
    }
    fs.unlinkSync(targetPath);
    return {
      success: true,
      type,
      name,
      message: `Diretriz '${name}' (tipo: ${type}) deletada com sucesso de .agents/guidelines/`,
      path: path.relative(path.resolve(REFERENCES_DIR, '..'), targetPath)
    };
  }

  return { success: false, error: `Ação inválida: ${action}. Use: list, read, write, delete.` };
}

module.exports = { handleManageGuidelines };
