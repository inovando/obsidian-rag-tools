const fs = require('fs');
const path = require('path');
const { REFERENCES_DIR } = require('../paths');

function getMemoryPath(targetDir) {
  const vaultRoot = targetDir ? path.resolve(targetDir) : path.resolve(REFERENCES_DIR, '..');
  return path.join(vaultRoot, '.obsidian', 'session_memory.json');
}

function loadStore(memoryPath) {
  if (!fs.existsSync(memoryPath)) {
    return { version: '2.0.0', projects: {} };
  }
  try {
    const raw = fs.readFileSync(memoryPath, 'utf8');
    const data = JSON.parse(raw);
    if (data.projects && typeof data.projects === 'object') {
      return data;
    }
    // Migração de formato legado (flat object) para formato por projeto
    return {
      version: '2.0.0',
      projects: {
        global: {
          project: 'global',
          context: data.context || 'Nenhuma memória ativa de sessão.',
          decisions: data.decisions || [],
          nextSteps: data.nextSteps || [],
          sessionNotes: data.sessionNotes || '',
          updatedAt: data.updatedAt || null
        }
      }
    };
  } catch {
    return { version: '2.0.0', projects: {} };
  }
}

function saveStore(memoryPath, storeData) {
  const memoryDir = path.dirname(memoryPath);
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }
  fs.writeFileSync(memoryPath, JSON.stringify(storeData, null, 2), 'utf8');
}

function handleManageSessionMemory(args = {}) {
  const { action = 'get', project, context, decisions, nextSteps, sessionNotes } = args;
  const memoryPath = getMemoryPath(args.targetDir);
  const store = loadStore(memoryPath);

  const rawProject = (project || '').trim();
  const projectKey = rawProject ? rawProject.toLowerCase().replace(/^proj-/, '') : null;

  if (action === 'get') {
    if (projectKey) {
      const projMem = store.projects[projectKey];
      if (!projMem) {
        return {
          success: true,
          project: projectKey,
          memory: {
            project: projectKey,
            context: `Nenhuma memória ativa de sessão para o projeto '${projectKey}'.`,
            decisions: [],
            nextSteps: [],
            sessionNotes: '',
            updatedAt: null
          }
        };
      }
      return { success: true, project: projectKey, memory: projMem };
    }

    // NENHUM PROJETO ESPECIFICADO: Retorna projeto mais recente ou 'global' com aviso
    const projectKeys = Object.keys(store.projects);
    const mostRecentKey = projectKeys.length > 0 ? projectKeys[0] : 'global';
    const activeMem = store.projects[mostRecentKey] || {
      project: 'global',
      context: 'Nenhuma memória ativa de sessão.',
      decisions: [],
      nextSteps: [],
      updatedAt: null
    };

    let warning = null;
    if (projectKeys.length > 1) {
      warning = `⚠️ ATENÇÃO: Nenhum parâmetro 'project' informado. O vault possui memórias isoladas para ${projectKeys.length} projetos (${projectKeys.map(k => `'${k}'`).join(', ')}). Exibindo projeto '${mostRecentKey}'. Para buscar a memória do seu projeto específico, passe project: '<slug>'.`;
    } else if (projectKeys.length === 1 && mostRecentKey !== 'global') {
      warning = `ℹ️ Exibindo memória do projeto '${mostRecentKey}'. Recomendado: passe project: '${mostRecentKey}' explicitamente.`;
    }

    return {
      success: true,
      project: activeMem.project || 'global',
      warning,
      memory: activeMem,
      allProjects: projectKeys
    };
  }

  if (action === 'save') {
    const keyToSave = projectKey || 'global';
    const existing = store.projects[keyToSave] || { decisions: [], nextSteps: [] };

    const updatedMemory = {
      project: keyToSave,
      context: context !== undefined ? context : existing.context || '',
      decisions: Array.isArray(decisions) ? decisions : existing.decisions || [],
      nextSteps: Array.isArray(nextSteps) ? nextSteps : existing.nextSteps || [],
      sessionNotes: sessionNotes !== undefined ? sessionNotes : existing.sessionNotes || '',
      updatedAt: new Date().toISOString()
    };

    store.projects[keyToSave] = updatedMemory;
    saveStore(memoryPath, store);

    return {
      success: true,
      project: keyToSave,
      message: `Memória de sessão salva com sucesso para o projeto '${keyToSave}' em .obsidian/session_memory.json`,
      memory: updatedMemory
    };
  }

  if (action === 'clear') {
    if (projectKey && projectKey !== 'all') {
      delete store.projects[projectKey];
      saveStore(memoryPath, store);
      return { success: true, project: projectKey, message: `Memória de sessão do projeto '${projectKey}' limpa com sucesso.` };
    } else {
      store.projects = {};
      saveStore(memoryPath, store);
      return { success: true, message: 'Todas as memórias de sessão do vault foram limpas com sucesso.' };
    }
  }

  return { success: false, error: `Ação inválida: ${action}` };
}

module.exports = { handleManageSessionMemory };
