const { handleQueryKnowledgeBase } = require('./lib/tools/query');
const { handleReadNote } = require('./lib/tools/read');
const { handleWriteNote } = require('./lib/tools/write');
const { handleMoveNote } = require('./lib/tools/move');
const { handleDeleteNote } = require('./lib/tools/delete');
const { handleValidateVault } = require('./lib/tools/validate');
const { handleReindexVault } = require('./lib/tools/reindex');
const { handleGetMcpMetrics } = require('./lib/tools/metrics');
const { recordError } = require('./lib/metrics');
const yaml = require('js-yaml');
const { tools } = require('./lib/schemas');

const isOfficialMode = process.argv.includes('--official') || process.env.MCP_OFFICIAL === 'true';

function formatToolResult(name, result) {
  let textContent = '';
  let isError = false;

  if (!result) {
    return {
      content: [{ type: 'text', text: 'Nenhum resultado retornado da ferramenta.' }],
      isError: false
    };
  }

  // Se result.success for explicitamente false e não for validate_vault, é um erro de domínio/validação
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
    // Casos de sucesso (ou validate_vault)
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
      textContent = `**Arquivo:** ${result.filePath}\n**Linhas:** ${result.lineCount} | **Caracteres:** ${result.characterCount}\n\n${fmYaml}${result.content || ''}`;
    } else if (name === 'write_note') {
      textContent = `✅ Nota escrita com sucesso!\n- **Arquivo:** ${result.filePath}\n- **Total de Linhas:** ${result.lineCount}`;
    } else if (name === 'move_note') {
      textContent = `✅ Nota movida com sucesso!\n- **Origem:** ${result.oldFilePath}\n- **Destino:** ${result.newFilePath}`;
    } else if (name === 'delete_note') {
      textContent = `✅ Nota deletada com sucesso!\n- **Arquivo:** ${result.filePath}`;
    } else if (name === 'reindex_vault') {
      textContent = `✅ Vault reindexado com sucesso!\n- **Arquivos processados:** ${result.totalFiles}\n- **Chunks vetoriais gerados:** ${result.totalChunks}`;
    } else if (name === 'validate_vault') {
      isError = !result.success; // se falhar na validação do vault, marcamos como erro no MCP
      const statusEmoji = result.success ? '✅ PASSED' : '❌ FAILED';
      textContent = `**Validação do Vault: ${statusEmoji}** (Exit Code: ${result.exitCode})\n\n`;
      if (result.stdout) {
        textContent += `**Saída (stdout):**\n\`\`\`\n${result.stdout.trim()}\n\`\`\`\n\n`;
      }
      if (result.stderr) {
        textContent += `**Erros (stderr):**\n\`\`\`\n${result.stderr.trim()}\n\`\`\`\n`;
      }
      if (!result.stdout && !result.stderr) {
        if (result.error) {
          textContent += `Erro ao executar o validador: ${result.error}`;
        } else {
          textContent += `Nenhuma saída produzida pelo validador.`;
        }
      }
    } else if (name === 'get_mcp_metrics') {
      textContent = result.report || JSON.stringify(result, null, 2);
    } else {
      // Fallback para qualquer outra ferramenta futura
      textContent = JSON.stringify(result, null, 2);
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: textContent
      }
    ],
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
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: "obsidian-rag-mcp-server",
        version: "1.2.0"
      }
    });
    return;
  }

  if (message.method === 'notifications/initialized') {
    return;
  }

  if (message.method === 'tools/list') {
    sendResponse(message.id, {
      tools
    });
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
  const response = {
    jsonrpc: "2.0",
    id: id,
    result: result
  };
  process.stdout.write(JSON.stringify(response) + '\n');
}

function sendError(id, code, message) {
  const response = {
    jsonrpc: "2.0",
    id: id,
    error: {
      code: code,
      message: message
    }
  };
  process.stdout.write(JSON.stringify(response) + '\n');
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
        const message = JSON.parse(line);
        handleMessage(message);
      } catch (err) {
        sendError(null, -32700, "Parse error: " + err.message);
      }
    }
  }
});

console.error("Obsidian RAG MCP Server v1.2.0 (Vector RAG Support) iniciado. Ready.");
