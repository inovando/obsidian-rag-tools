const fs = require('fs');
const path = require('path');
const { REFERENCES_DIR } = require('../paths');

function getMemoryPath(targetDir) {
  const vaultRoot = targetDir ? path.resolve(targetDir) : path.resolve(REFERENCES_DIR, '..');
  return path.join(vaultRoot, '.obsidian', 'session_memory.json');
}

function handleManageSessionMemory(args = {}) {
  const { action = 'get', context, decisions, nextSteps, sessionNotes } = args;
  const memoryPath = getMemoryPath(args.targetDir);
  const memoryDir = path.dirname(memoryPath);

  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }

  if (action === 'get') {
    if (!fs.existsSync(memoryPath)) {
      return {
        success: true,
        memory: {
          context: 'Nenhuma memória ativa de sessão.',
          decisions: [],
          nextSteps: [],
          updatedAt: null
        }
      };
    }
    try {
      const raw = fs.readFileSync(memoryPath, 'utf8');
      return { success: true, memory: JSON.parse(raw) };
    } catch {
      return { success: true, memory: { context: '', decisions: [], nextSteps: [], updatedAt: null } };
    }
  }

  if (action === 'save') {
    let existingMemory = { decisions: [], nextSteps: [] };
    if (fs.existsSync(memoryPath)) {
      try {
        existingMemory = JSON.parse(fs.readFileSync(memoryPath, 'utf8')) || existingMemory;
      } catch {
        // ignore
      }
    }

    const updatedMemory = {
      context: context !== undefined ? context : existingMemory.context || '',
      decisions: Array.isArray(decisions) ? decisions : existingMemory.decisions || [],
      nextSteps: Array.isArray(nextSteps) ? nextSteps : existingMemory.nextSteps || [],
      sessionNotes: sessionNotes !== undefined ? sessionNotes : existingMemory.sessionNotes || '',
      updatedAt: new Date().toISOString()
    };

    fs.writeFileSync(memoryPath, JSON.stringify(updatedMemory, null, 2), 'utf8');
    return {
      success: true,
      message: 'Memória de sessão salva com sucesso em .obsidian/session_memory.json',
      memory: updatedMemory
    };
  }

  if (action === 'clear') {
    if (fs.existsSync(memoryPath)) {
      fs.unlinkSync(memoryPath);
    }
    return { success: true, message: 'Memória de sessão limpa com sucesso.' };
  }

  return { success: false, error: `Ação inválida: ${action}` };
}

module.exports = { handleManageSessionMemory };
