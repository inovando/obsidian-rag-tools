/**
 * Definições de ferramentas e seus respectivos schemas JSON-RPC para o Obsidian RAG MCP.
 * Compartilhado entre o servidor MCP e o gerador de configurações de setup.
 */

const tools = [
  {
    name: "query_knowledge_base",
    description: "Busca notas de referência no vault Obsidian combinando busca semântica por similaridade vetorial (RAG local) e filtro por palavras-chave/tags/tópicos (RRF). Suporta modo compacto para economia de tokens.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Texto da consulta livre ou pergunta conceitual (ex: 'Como funciona o event loop no Node.js?')."
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Lista de tags para filtrar (ex: ['nodejs', 'hooks', 'orm'])."
        },
        topic: {
          type: "string",
          description: "Tópico específico para correspondência no frontmatter."
        },
        compact: {
          type: "boolean",
          description: "Se true, retorna apenas a lista de notas e tópicos sem trechos longos (economiza até 70% de tokens)."
        }
      }
    }
  },
  {
    name: "read_note",
    description: "Lê o conteúdo de uma nota no vault. Suporta filtro por seção (heading), intervalo de linhas ou modo resumo para economia de tokens.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Caminho relativo da nota dentro do vault (ex: nodejs/event-loop.md)."
        },
        heading: {
          type: "string",
          description: "Nome de um cabeçalho/seção específico para ler apenas esse bloco (ex: 'Exemplo Prático')."
        },
        startLine: {
          type: "integer",
          description: "Linha inicial para leitura parcial."
        },
        endLine: {
          type: "integer",
          description: "Linha final para leitura parcial."
        },
        summaryOnly: {
          type: "boolean",
          description: "Se true, retorna apenas frontmatter e lista de seções sem o corpo do texto."
        }
      },
      required: ["filePath"]
    }
  },
  {
    name: "write_note",
    description: "Cria ou atualiza uma nota de referência no vault. Valida frontmatter, limites de linha (máx 200), links e reindexa vetores automaticamente.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Caminho relativo da nota dentro do vault (ex: references/nodejs/event-loop.md)."
        },
        topic: {
          type: "string",
          description: "O tópico da nota (metadados)."
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Array de tags aplicáveis."
        },
        sources: {
          type: "array",
          items: { type: "string" },
          description: "Array de links de fontes oficiais."
        },
        content: {
          type: "string",
          description: "O corpo principal da nota em markdown."
        }
      },
      required: ["filePath", "topic", "tags", "sources", "content"]
    }
  },
  {
    name: "get_pending_reviews",
    description: "Retorna a lista de todas as notas que aguardam revisão humana (verified_by_reviewer: false). Ferramenta 100% somente leitura.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "list_skills",
    description: "Lista todas as skills técnicas e manuais especializados disponíveis em .agents/skills/.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "read_skill",
    description: "Carrega o manual, checklist e diretrizes de uma skill técnica específica salva no vault.",
    inputSchema: {
      type: "object",
      properties: {
        skillId: {
          type: "string",
          description: "O ID/nome da skill a ser carregada (ex: 'langchain', 'spec-driven-dev')."
        }
      },
      required: ["skillId"]
    }
  },
  {
    name: "manage_agent_profile",
    description: "Gerencia e evolui os perfis do time de agentes especializados (.agents/profiles/). Permite listar, ler, criar e editar prompts de agentes.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "read", "write"],
          description: "Ação a executar: 'list' (listar agentes), 'read' (ler prompt), 'write' (criar/evoluir agente)."
        },
        agentId: {
          type: "string",
          description: "ID do agente (ex: 'architect', 'reviewer', 'langchain-specialist')."
        },
        role: {
          type: "string",
          description: "Papel/título do agente."
        },
        description: {
          type: "string",
          description: "Descrição da especialidade do agente."
        },
        content: {
          type: "string",
          description: "Conteúdo markdown completo com o prompt de sistema e instruções atualizadas."
        }
      }
    }
  },
  {
    name: "manage_session_memory",
    description: "Gerencia a memória contínua de sessão (.obsidian/session_memory.json) para que a IA recupere o contexto, decisões e próximos passos rapidamente.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["get", "save", "clear"],
          description: "Ação a executar: 'get' (recuperar memória), 'save' (salvar memória), 'clear' (limpar)."
        },
        context: {
          type: "string",
          description: "Resumo do contexto ativo da sessão."
        },
        decisions: {
          type: "array",
          items: { type: "string" },
          description: "Lista de decisões técnicas tomadas na sessão."
        },
        nextSteps: {
          type: "array",
          items: { type: "string" },
          description: "Lista de próximos passos pendentes."
        }
      }
    }
  },
  {
    name: "move_note",
    description: "Move ou renomeia uma nota (arquivo) no vault RAG.",
    inputSchema: {
      type: "object",
      properties: {
        oldFilePath: { type: "string" },
        newFilePath: { type: "string" }
      },
      required: ["oldFilePath", "newFilePath"]
    }
  },
  {
    name: "delete_note",
    description: "Remove/deleta uma nota (arquivo) no vault RAG.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string" }
      },
      required: ["filePath"]
    }
  },
  {
    name: "validate_vault",
    description: "Executa a ferramenta de validação automatizada no vault RAG.",
    inputSchema: {
      type: "object",
      properties: {
        targetDir: { type: "string" }
      }
    }
  },
  {
    name: "reindex_vault",
    description: "Re-indexa todo o vault Obsidian para regerar os embeddings vetoriais locais (.obsidian/rag-index.json).",
    inputSchema: {
      type: "object",
      properties: {
        targetDir: { type: "string" }
      }
    }
  },
  {
    name: "get_mcp_metrics",
    description: "Retorna o relatório operacional de métricas e latência do MCP.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  }
];

module.exports = {
  tools
};
