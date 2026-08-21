#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

// Obter raiz do vault
const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();

console.log(`\n======================================================`);
console.log(`Iniciando Setup do MCP e Regras de LLM em:`);
console.log(`${targetDir}`);
console.log(`======================================================\n`);

// 1. Validar se o diretório do vault existe e possui estrutura básica
const templatesDir = path.join(targetDir, 'templates');
const referencesDir = path.join(targetDir, 'references');

if (!fs.existsSync(templatesDir) && !fs.existsSync(referencesDir)) {
  console.warn(`⚠️ O diretório atual não parece conter a estrutura de um Obsidian Vault (templates/ ou references/).`);
  console.log(`Dica: Rode 'npx @inovan.do/obsidian-rag-tools obsidian-rag-init' primeiro para inicializar.\n`);
}

// 2. Determinar comandos e argumentos baseados no modo de execução (Dev vs Prod)
const isDev = !__dirname.includes('node_modules');
const absoluteMcpPath = path.resolve(__dirname, 'mcp.js');

let mcpCommand = 'npx';
let mcpArgs = ['-y', '@inovan.do/obsidian-rag-tools', 'obsidian-rag-mcp'];

if (isDev) {
  mcpCommand = 'node';
  mcpArgs = [absoluteMcpPath];
}

console.log(`Modo de execução detectado: ${isDev ? 'DESENVOLVIMENTO (Local)' : 'PRODUÇÃO (NPM)'}`);
console.log(`Comando MCP a ser configurado: ${mcpCommand} ${mcpArgs.join(' ')}\n`);

// --- CONFIGURAÇÃO CLAUDE DESKTOP ---
function getClaudeConfigPath() {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  } else if (process.platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appdata, 'Claude', 'claude_desktop_config.json');
  } else {
    return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
  }
}

function setupClaudeDesktop(vaultRoot, command, args) {
  const configPath = getClaudeConfigPath();
  const configDir = path.dirname(configPath);

  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    let config = { mcpServers: {} };
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      config = JSON.parse(content) || { mcpServers: {} };
      if (!config.mcpServers) config.mcpServers = {};
      
      // Criar backup antes de modificar
      fs.copyFileSync(configPath, configPath + '.bak');
    }

    config.mcpServers['obsidian-rag'] = {
      command: command,
      args: args,
      env: {
        OBSIDIAN_VAULT_PATH: vaultRoot
      }
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log(`✅ MCP configurado no Claude Desktop!`);
    console.log(`   Arquivo: ${configPath}`);
    if (fs.existsSync(configPath + '.bak')) {
      console.log(`   [Backup criado em ${configPath}.bak]`);
    }
  } catch (err) {
    console.warn(`❌ Falha ao configurar Claude Desktop: ${err.message}`);
  }
}

// --- CONFIGURAÇÃO CURSOR (.cursorrules e instruções) ---
function setupCursorRules(vaultRoot) {
  const agentsMdPath = path.join(vaultRoot, 'AGENTS.md');
  const cursorRulesPath = path.join(vaultRoot, '.cursorrules');

  try {
    let content = '';
    if (fs.existsSync(agentsMdPath)) {
      content = fs.readFileSync(agentsMdPath, 'utf8');
    } else {
      const localAgentsMd = path.resolve(__dirname, '..', 'AGENTS.md');
      if (fs.existsSync(localAgentsMd)) {
        content = fs.readFileSync(localAgentsMd, 'utf8');
      }
    }

    if (content) {
      fs.writeFileSync(cursorRulesPath, content, 'utf8');
      console.log(`✅ Regras de IA (.cursorrules) configuradas na raiz do vault!`);
    } else {
      console.warn(`⚠️ Não foi possível encontrar o arquivo AGENTS.md para gerar o .cursorrules.`);
    }
  } catch (err) {
    console.warn(`❌ Falha ao gerar .cursorrules: ${err.message}`);
  }
}

// --- CONFIGURAÇÃO CODEX / COPILOT INSTRUCTIONS ---
function setupCopilotInstructions(vaultRoot) {
  const githubDir = path.join(vaultRoot, '.github');
  const copilotInstructionsPath = path.join(githubDir, 'copilot-instructions.md');
  const agentsMdPath = path.join(vaultRoot, 'AGENTS.md');

  try {
    if (!fs.existsSync(githubDir)) {
      fs.mkdirSync(githubDir, { recursive: true });
    }

    let content = '';
    if (fs.existsSync(agentsMdPath)) {
      content = fs.readFileSync(agentsMdPath, 'utf8');
    } else {
      const localAgentsMd = path.resolve(__dirname, '..', 'AGENTS.md');
      if (fs.existsSync(localAgentsMd)) {
        content = fs.readFileSync(localAgentsMd, 'utf8');
      }
    }

    if (content) {
      fs.writeFileSync(copilotInstructionsPath, content, 'utf8');
      console.log(`✅ Regras de IA (.github/copilot-instructions.md) configuradas para GitHub Copilot/Codex!`);
    }
  } catch (err) {
    console.warn(`❌ Falha ao gerar regras do Copilot: ${err.message}`);
  }
}

// --- CONFIGURAÇÃO VS CODE / OPENCODE (Continue & Cline / Roo Code) ---
function setupVsCodeMcp(vaultRoot, command, args) {
  const home = os.homedir();
  
  // 1. Continue Extension (~/.continue/config.json)
  const continueConfigPath = path.join(home, '.continue', 'config.json');
  if (fs.existsSync(continueConfigPath)) {
    try {
      const content = fs.readFileSync(continueConfigPath, 'utf8');
      const config = JSON.parse(content);
      if (!config.mcpServers) config.mcpServers = [];

      // Atualiza ou insere o mcpServer
      config.mcpServers = config.mcpServers.filter(s => s.name !== 'obsidian-rag');
      config.mcpServers.push({
        name: 'obsidian-rag',
        command: command,
        args: args,
        env: {
          OBSIDIAN_VAULT_PATH: vaultRoot
        }
      });

      fs.copyFileSync(continueConfigPath, continueConfigPath + '.bak');
      fs.writeFileSync(continueConfigPath, JSON.stringify(config, null, 2), 'utf8');
      console.log(`✅ MCP configurado na extensão Continue (~/.continue/config.json)!`);
    } catch (err) {
      console.warn(`❌ Falha ao configurar extensão Continue: ${err.message}`);
    }
  }

  // 2. Cline / Roo Code
  const pathsToCheck = [];
  if (process.platform === 'darwin') {
    pathsToCheck.push(
      path.join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
      path.join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'cline_mcp_settings.json')
    );
  } else if (process.platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    pathsToCheck.push(
      path.join(appdata, 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
      path.join(appdata, 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'cline_mcp_settings.json')
    );
  } else {
    // Linux
    pathsToCheck.push(
      path.join(home, '.config', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
      path.join(home, '.config', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'cline_mcp_settings.json'),
      path.join(home, '.config', 'VSCodium', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
      path.join(home, '.config', 'opencode', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json')
    );
  }

  for (const configPath of pathsToCheck) {
    if (fs.existsSync(configPath)) {
      try {
        const fileContent = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(fileContent) || { mcpServers: {} };
        if (!config.mcpServers) config.mcpServers = {};

        config.mcpServers['obsidian-rag'] = {
          command: command,
          args: args,
          env: {
            OBSIDIAN_VAULT_PATH: vaultRoot
          }
        };

        fs.copyFileSync(configPath, configPath + '.bak');
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        const relativeName = path.relative(home, configPath);
        console.log(`✅ MCP configurado no Cline/Roo Code (~/${relativeName})!`);
      } catch (err) {
        console.warn(`❌ Falha ao configurar Cline/Roo Code (${configPath}): ${err.message}`);
      }
    }
  }
}

// --- CONFIGURAÇÃO CLAUDE CODE (~/.claude.json) ---
function setupClaudeCodeMcp(vaultRoot, command, args) {
  const home = os.homedir();
  const claudeJsonPath = path.join(home, '.claude.json');

  if (fs.existsSync(claudeJsonPath)) {
    try {
      const content = fs.readFileSync(claudeJsonPath, 'utf8');
      const config = JSON.parse(content) || {};
      if (!config.mcpServers) config.mcpServers = {};

      config.mcpServers['obsidian-rag'] = {
        command: command,
        args: args,
        env: {
          OBSIDIAN_VAULT_PATH: vaultRoot
        },
        type: 'stdio'
      };

      fs.copyFileSync(claudeJsonPath, claudeJsonPath + '.bak');
      fs.writeFileSync(claudeJsonPath, JSON.stringify(config, null, 2), 'utf8');
      console.log(`✅ MCP configurado no Claude Code (~/.claude.json)!`);
    } catch (err) {
      console.warn(`❌ Falha ao configurar Claude Code: ${err.message}`);
    }
  }
}

// --- CONFIGURAÇÃO ANTIGRAVITY (2.0 / IDE) ---
function setupAntigravityMcp() {
  const home = os.homedir();
  const antigravityMcpDir = path.join(home, '.gemini', 'antigravity', 'mcp', 'obsidian-rag');

  try {
    if (!fs.existsSync(antigravityMcpDir)) {
      fs.mkdirSync(antigravityMcpDir, { recursive: true });
    }

    // Importar schemas
    let tools = [];
    try {
      const schemas = require('../lib/schemas');
      tools = schemas.tools;
    } catch (e) {
      console.warn("⚠️ Não foi possível importar lib/schemas.js diretamente. Tentando carregar de forma alternativa.");
      // Fallback básico se a importação falhar por caminhos relativos
      const schemasPath = path.resolve(__dirname, '..', 'lib', 'schemas.js');
      if (fs.existsSync(schemasPath)) {
        tools = require(schemasPath).tools;
      }
    }

    if (tools && tools.length > 0) {
      for (const tool of tools) {
        const toolFilePath = path.join(antigravityMcpDir, `${tool.name}.json`);
        fs.writeFileSync(toolFilePath, JSON.stringify(tool, null, 2), 'utf8');
      }

      const instructionsPath = path.join(antigravityMcpDir, 'instructions.md');
      const instructionsContent = 'Use este servidor para buscar guias técnicos e documentação oficial (Node.js, React, Next.js, AdonisJS) armazenados na base de conhecimento local. Use write_note para registrar novas lições aprendidas e documentações importantes.\n';
      fs.writeFileSync(instructionsPath, instructionsContent, 'utf8');

      console.log(`✅ MCP configurado no Antigravity IDE / Antigravity 2.0!`);
      console.log(`   Destino: ${antigravityMcpDir}`);
    } else {
      console.warn("⚠️ Nenhum schema de ferramenta encontrado. Ignorando configuração do Antigravity.");
    }
  } catch (err) {
    console.warn(`❌ Falha ao configurar Antigravity: ${err.message}`);
  }
}

// Executar setups
console.log(`Configurando Claude Desktop...`);
setupClaudeDesktop(targetDir, mcpCommand, mcpArgs);

console.log(`\nConfigurando regras do Cursor (.cursorrules)...`);
setupCursorRules(targetDir);

console.log(`\nConfigurando regras do GitHub Copilot/Codex (.github/copilot-instructions.md)...`);
setupCopilotInstructions(targetDir);

console.log(`\nConfigurando VS Code / OpenCode (Continue / Cline / Roo Code)...`);
setupVsCodeMcp(targetDir, mcpCommand, mcpArgs);

console.log(`\nConfigurando Antigravity 2.0 / Antigravity IDE...`);
setupAntigravityMcp();

console.log(`\nConfigurando Claude Code...`);
setupClaudeCodeMcp(targetDir, mcpCommand, mcpArgs);

console.log(`\n======================================================`);
console.log(`Configuração Concluída com Sucesso!`);
console.log(`======================================================`);
console.log(`\nInstruções Manuais / Validação:`);
console.log(`1. Se estiver usando o Cursor:`);
console.log(`   - Adicione manualmente no menu Features -> MCP clicando em '+ Add New MCP Server'`);
console.log(`   - Name: obsidian-rag`);
console.log(`   - Type: command`);
console.log(`   - Command: ${mcpCommand} ${mcpArgs.join(' ')}`);
console.log(`   - Env (Variavel de Ambiente): OBSIDIAN_VAULT_PATH = ${targetDir}`);
console.log(`2. Reinicie seu cliente LLM (Claude Desktop, VS Code, Cursor) para aplicar as alterações.`);
console.log(`======================================================\n`);
