const fs = require('fs');
const path = require('path');
const { REFERENCES_DIR } = require('../paths');

function getAgentsDir(targetDir) {
  const vaultRoot = targetDir || path.resolve(REFERENCES_DIR, '..');
  return path.join(vaultRoot, '.agents', 'skills');
}

function handleListSkills(args = {}) {
  const skillsDir = getAgentsDir(args.targetDir);
  if (!fs.existsSync(skillsDir)) return { skills: [] };

  const skills = [];
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
      if (fs.existsSync(skillPath)) {
        const content = fs.readFileSync(skillPath, 'utf8');
        const firstLine = content.split(/\r?\n/).find(l => l.startsWith('# ')) || `# ${entry.name}`;
        const name = firstLine.replace('# ', '').trim();
        skills.push({
          id: entry.name,
          name,
          path: path.relative(path.resolve(REFERENCES_DIR, '..'), skillPath)
        });
      }
    }
  }

  return { skills };
}

function handleReadSkill(args = {}) {
  const { skillId } = args;
  if (!skillId) return { success: false, error: 'skillId is required' };

  const skillsDir = getAgentsDir(args.targetDir);
  const skillPath = path.join(skillsDir, skillId, 'SKILL.md');

  if (!fs.existsSync(skillPath)) {
    return { success: false, error: `Skill '${skillId}' não encontrada em .agents/skills/` };
  }

  const content = fs.readFileSync(skillPath, 'utf8');
  return {
    success: true,
    skillId,
    content,
    path: path.relative(path.resolve(REFERENCES_DIR, '..'), skillPath)
  };
}

module.exports = {
  handleListSkills,
  handleReadSkill
};
