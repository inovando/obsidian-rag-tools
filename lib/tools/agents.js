const fs = require('fs');
const path = require('path');
const { REFERENCES_DIR } = require('../paths');

function getProfilesDir(targetDir) {
  const vaultRoot = targetDir || path.resolve(REFERENCES_DIR, '..');
  return path.join(vaultRoot, '.agents', 'profiles');
}

function handleManageAgentProfile(args = {}) {
  const { action = 'list', agentId, content, role, description } = args;
  const profilesDir = getProfilesDir(args.targetDir);

  if (!fs.existsSync(profilesDir)) {
    fs.mkdirSync(profilesDir, { recursive: true });
  }

  if (action === 'list') {
    const profiles = [];
    const entries = fs.readdirSync(profilesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const fullPath = path.join(profilesDir, entry.name);
        const fileContent = fs.readFileSync(fullPath, 'utf8');
        const id = entry.name.replace(/\.md$/, '');
        const firstLine = fileContent.split(/\r?\n/).find(l => l.startsWith('# ')) || `# ${id}`;
        profiles.push({
          agentId: id,
          role: firstLine.replace('# ', '').trim(),
          path: path.relative(path.resolve(REFERENCES_DIR, '..'), fullPath)
        });
      }
    }
    return { profiles };
  }

  if (action === 'read') {
    if (!agentId) return { success: false, error: 'agentId is required for read' };
    const profilePath = path.join(profilesDir, `${agentId}.md`);
    if (!fs.existsSync(profilePath)) {
      return { success: false, error: `Perfil de agente '${agentId}' não encontrado em .agents/profiles/` };
    }
    const fileContent = fs.readFileSync(profilePath, 'utf8');
    return {
      success: true,
      agentId,
      content: fileContent,
      path: path.relative(path.resolve(REFERENCES_DIR, '..'), profilePath)
    };
  }

  if (action === 'write') {
    if (!agentId) return { success: false, error: 'agentId is required for write' };
    if (!content && !role) return { success: false, error: 'content or role is required for write' };

    const profilePath = path.join(profilesDir, `${agentId}.md`);
    let finalContent = content;

    if (!finalContent) {
      finalContent = `# Agente Especializado: ${role || agentId}\n\n## Descrição\n${description || 'Agente especializado salvo no vault.'}\n\n## Instruções & Prompt de Sistema\n- Seguir as diretrizes do AGENTS.md.\n- Aplicar Clean Code e padrões RAG.`;
    }

    fs.writeFileSync(profilePath, finalContent, 'utf8');
    return {
      success: true,
      agentId,
      message: `Perfil do agente '${agentId}' atualizado/salvo com sucesso em .agents/profiles/${agentId}.md`,
      path: path.relative(path.resolve(REFERENCES_DIR, '..'), profilePath)
    };
  }

  if (action === 'delete') {
    if (!agentId) return { success: false, error: 'agentId is required for delete' };
    const profilePath = path.join(profilesDir, `${agentId}.md`);
    if (!fs.existsSync(profilePath)) {
      return { success: false, error: `Perfil de agente '${agentId}' não encontrado em .agents/profiles/` };
    }
    fs.unlinkSync(profilePath);
    return {
      success: true,
      agentId,
      message: `Perfil do agente '${agentId}' deletado com sucesso de .agents/profiles/`,
      path: path.relative(path.resolve(REFERENCES_DIR, '..'), profilePath)
    };
  }

  return { success: false, error: `Ação inválida: ${action}. Use: list, read, write, delete.` };
}

module.exports = { handleManageAgentProfile };
