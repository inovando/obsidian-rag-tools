const { handleQueryKnowledgeBase } = require('./lib/tools/query');
const { handleReadNote } = require('./lib/tools/read');
const { handleWriteNote } = require('./lib/tools/write');
const { handleMoveNote } = require('./lib/tools/move');
const { handleDeleteNote } = require('./lib/tools/delete');
const { handleValidateVault } = require('./lib/tools/validate');
const { handleReindexVault } = require('./lib/tools/reindex');
const { handleGetPendingReviews } = require('./lib/tools/pending');
const { handleListSkills, handleReadSkill } = require('./lib/tools/skills');
const { handleManageAgentProfile } = require('./lib/tools/agents');
const { handleManageGuidelines } = require('./lib/tools/guidelines');
const { handleManageSessionMemory } = require('./lib/tools/memory');
const { handleGetMcpMetrics } = require('./lib/tools/metrics');
const { recordError } = require('./lib/metrics');
const yaml = require('js-yaml');
const { tools } = require('./lib/schemas');

function formatToolResult(name, result) {
  let textContent = '';
  let isError = false;

  if (!result) {
    return {
      content: [{ type: 'text', text: 'Nenhum resultado retornado da ferramenta.' }],
      isError: false
    };
  }

  if (result.success === false && name !== 'validate_vault') {
    isError = true;
    if (result.error) {
      textContent = `Erro: ${result.error}`;
    } else if (result.errors && Array.isArray(result.errors)) {
      textContent = `Erros de validação:\n${result.errors.map(e => `- ${e}`).join('\n')}`;
    } else {
      textContent = 'Ocorreu um erro desconhecido na execução da ferramenta.';
    }
  } else {
    if (name === 'query_knowledge_base') {
      if (!result.results || result.results.length === 0) {
        textContent = 'Nenhuma nota encontrada para os critérios informados.';
      } else {
        textContent = result.results.map(r => {
          const tagsStr = (r.frontmatter && Array.isArray(r.frontmatter.tags)) ? r.frontmatter.tags.join(', ') : 'Nenhuma';
          const topicStr = (r.frontmatter && r.frontmatter.topic) || 'Nenhum';
          return `### Nota: ${r.filePath} (Score RRF: ${r.score})\n- **Tópico:** ${topicStr}\n- **Tags:** ${tagsStr}\n- **Semantic Score:** ${r.semanticScore} | **Keyword Score:** ${r.keywordScore}\n\n**Trecho:**\n${r.excerpt}\n\n---`;
        }).join('\n\n');
      }
    } else if (name === 'read_note') {
      const fmYaml = (result.frontmatter && Object.keys(result.frontmatter).length > 0)
        ? `---\n${yaml.dump(result.frontmatter)}---\n`
        : '';
      const filterMsg = result.filterApplied !== 'full' ? ` [Filtro Aplicado: ${result.filterApplied}]` : '';
      textContent = `**Arquivo:** ${result.filePath}${filterMsg}\n**Linhas do Vault:** ${result.lineCount} | **Caracteres:** ${result.characterCount}\n\n${fmYaml}${result.content || ''}`;
    } else if (name === 'write_note') {
      textContent = `✅ Nota escrita com sucesso!\n- **Arquivo:** ${result.filePath}\n- **Total de Linhas:** ${result.lineCount}`;
    } else if (name === 'manage_guidelines') {
      if (result.guidelines) {
        textContent = `📐 **Diretrizes de Código e Projeto Registradas (${result.guidelines.length}):**\n\n`;
        textContent += result.guidelines.map(g => `- **[${g.type.toUpperCase()}]** \`${g.name}\` (${g.path})`).join('\n');
      } else {
        textContent = result.message || `📐 **Diretriz ${result.name} (${result.type}):**\n\n${result.content}`;
      }
    } else if (name === 'get_pending_reviews') {
      if (result.totalPending === 0) {
        textContent = `✅ Nenhuma nota pendente de revisão humana! Todas as notas estão aprovadas (verified_by_reviewer: true).`;
      } else {
        const start = result.offset + 1;
        const end = Math.min(result.totalPending, result.offset + result.pendingNotes.length);
        const folderSummary = Object.entries(result.pendingByFolder || {})
          .map(([folder, count]) => `- \`${folder}/\`: ${count} notas pendentes`)
          .join('\n');

        textContent = `📌 **Relatório de Notas Pendentes de Revisão Humana:**\n`;
        textContent += `- **Total de Pendências no Vault:** ${result.totalPending}\n`;
        textContent += `- **Exibindo:** ${start} a ${end} (Offset: ${result.offset} | Limite: ${result.limit})\n\n`;
        if (folderSummary) {
          textContent += `📊 **Resumo de Pendências por Pasta:**\n${folderSummary}\n\n`;
        }
        textContent += `📋 **Lista Paginada de Pendências:**\n`;
        textContent += result.pendingNotes.map(n => `- **${n.filePath}** | Tópico: ${n.topic} | Modificado: ${n.last_updated}`).join('\n');
        if (result.hasMore) {
          textContent += `\n\n💡 *Existem mais notas pendentes. Use limit=${result.limit} e offset=${result.offset + result.limit} para avançar.*`;
        }
      }
    } else if (name === 'list_skills') {
      if (!result.skills || result.skills.length === 0) {
        textContent = `Nenhuma skill cadastrada em .agents/skills/`;
      } else {
        textContent = `🧠 **Skills Especializadas Disponíveis (${result.skills.length}):**\n\n`;
        textContent += result.skills.map(s => `- **ID:** \`${s.id}\` | Nome: ${s.name} (${s.path})`).join('\n');
      }
    } else if (name === 'read_skill') {
      textContent = `📖 **Skill: ${result.skillId}** (${result.path})\n\n${result.content}`;
    } else if (name === 'manage_agent_profile') {
      if (result.profiles) {
        textContent = `👥 **Time de Agentes Especializados no Vault (${result.profiles.length}):**\n\n`;
        textContent += result.profiles.map(p => `- **ID:** \`${p.agentId}\` | Papel: ${p.role}`).join('\n');
      } else {
        textContent = result.message || `**Agente ${result.agentId}:**\n\n${result.content}`;
      }
    } else if (name === 'manage_session_memory') {
      if (result.memory) {
        const mem = result.memory;
        textContent = `🧠 **Memória de Sessão Ativa:**\n- **Atualizado em:** ${mem.updatedAt || 'Nunca'}\n- **Contexto:** ${mem.context || 'N/A'}\n- **Decisões (${(mem.decisions || []).length}):**\n${(mem.decisions || []).map(d => `  * ${d}`).join('\n')}\n- **Próximos Passos (${(mem.nextSteps || []).length}):**\n${(mem.nextSteps || []).map(n => `  * ${n}`).join('\n')}`;
      } else {
        textContent = result.message || JSON.stringify(result, null, 2);
      }
    } else if (name === 'move_note') {
      textContent = `✅ Nota movida com sucesso!\n- **Origem:** ${result.oldFilePath}\n- **Destino:** ${result.newFilePath}`;
    } else if (name === 'delete_note') {
      textContent = `✅ Nota deletada com sucesso!\n- **Arquivo:** ${result.filePath}`;
    } else if (name === 'reindex_vault') {
      textContent = `✅ Vault reindexado com sucesso!\n- **Arquivos processados:** ${result.totalFiles}\n- **Chunks vetoriais gerados:** ${result.totalChunks}`;
    } else if (name === 'validate_vault') {
      isError = !result.success;
      const statusEmoji = result.success ? '✅ PASSED' : '❌ FAILED';
      textContent = `**Validação do Vault: ${statusEmoji}** (Exit Code: ${result.exitCode})\n\n`;
      if (result.stdout) textContent += `**Saída (stdout):**\n\`\`\`\n${result.stdout.trim()}\n\`\`\`\n\n`;
      if (result.stderr) textContent += `**Erros (stderr):**\n\`\`\`\n${result.stderr.trim()}\n\`\`\`\n`;
    } else if (name === 'get_mcp_metrics') {
      textContent = result.report || JSON.stringify(result, null, 2);
    } else {
      textContent = JSON.stringify(result, null, 2);
    }
  }

  return {
    content: [{ type: 'text', text: textContent }],
    isError
  };
}

async function handleMessage(message) {
  if (message.jsonrpc !== '2.0') {
    sendError(message.id || null, -32600, "Invalid Request: missing jsonrpc 2.0");
    return;
  }

  if (message.method === 'initialize') {
    sendResponse(message.id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "obsidian-rag-mcp-server", version: "1.2.1" }
    });
    return;
  }

  if (message.method === 'notifications/initialized') return;

  if (message.method === 'tools/list') {
    sendResponse(message.id, { tools });
    return;
  }

  if (message.method === 'tools/call') {
    const { name, arguments: args } = message.params || {};
    let result;

    try {
      if (name === 'query_knowledge_base') {
        result = await handleQueryKnowledgeBase(args || {});
      } else if (name === 'read_note') {
        result = handleReadNote(args || {});
      } else if (name === 'write_note') {
        result = await handleWriteNote(args || {});
      } else if (name === 'move_note') {
        result = handleMoveNote(args || {});
      } else if (name === 'delete_note') {
        result = handleDeleteNote(args || {});
      } else if (name === 'manage_guidelines') {
        result = handleManageGuidelines(args || {});
      } else if (name === 'get_pending_reviews') {
        result = handleGetPendingReviews(args || {});
      } else if (name === 'list_skills') {
        result = handleListSkills(args || {});
      } else if (name === 'read_skill') {
        result = handleReadSkill(args || {});
      } else if (name === 'manage_agent_profile') {
        result = handleManageAgentProfile(args || {});
      } else if (name === 'manage_session_memory') {
        result = handleManageSessionMemory(args || {});
      } else if (name === 'reindex_vault') {
        result = await handleReindexVault(args || {});
      } else if (name === 'validate_vault') {
        result = await handleValidateVault(args || {});
      } else if (name === 'get_mcp_metrics') {
        result = handleGetMcpMetrics();
      } else {
        sendError(message.id, -32601, `Method not found: tool ${name}`);
        return;
      }
    } catch (err) {
      recordError();
      sendError(message.id, -32603, `Erro interno: ${err.message}`);
      return;
    }

    const finalResult = formatToolResult(name, result);
    sendResponse(message.id, finalResult);
    return;
  }

  sendError(message.id || null, -32601, `Method not found: ${message.method}`);
}

function sendResponse(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + '\n');
}

function sendError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + '\n');
}

let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk.toString();
  let lineEnd;
  while ((lineEnd = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, lineEnd).trim();
    buffer = buffer.slice(lineEnd + 1);
    if (line) {
      try {
        handleMessage(JSON.parse(line));
      } catch (err) {
        sendError(null, -32700, "Parse error: " + err.message);
      }
    }
  }
});

console.error("Obsidian RAG MCP Server v1.2.1 iniciado. Ready.");
