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
          description: "Pré-filtro estrito por lista de tags (ex: ['nodejs', 'hooks', 'orm'])."
        },
        topic: {
          type: "string",
          description: "Pré-filtro estrito por tópico no frontmatter."
        },
        compact: {
          type: "boolean",
          description: "Se true, omite os trechos longos (excerpt), retornando apenas metadados e scores (economiza até 70% de tokens)."
        },
        limit: {
          type: "integer",
          description: "Quantidade máxima de notas a retornar (padrão: 5, máximo: 20)."
        },
        minScore: {
          type: "number",
          description: "Pontuação mínima de relevância RRF para filtrar notas irrelevantes. Faixa típica: 0.005–0.05 (scores RRF são geralmente entre 0 e 0.06). Exemplo: 0.01 descarta resultados com baixa relevância."
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
    name: "manage_guidelines",
    description: "Gerencia e consulta as diretrizes de código do projeto e da linguagem (.agents/guidelines/). Permite listar, ler ou criar/atualizar diretrizes de estilo, linguagens (ex: typescript, python) e projetos.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "read", "write", "delete"],
          description: "Ação: 'list' (listar diretrizes), 'read' (ler diretriz), 'write' (salvar/atualizar diretriz), 'delete' (remover diretriz)."
        },
        type: {
          type: "string",
          enum: ["global", "language", "project"],
          description: "Tipo de diretriz: 'global' (estilo geral), 'language' (linguagem específica), 'project' (projeto específico)."
        },
        name: {
          type: "string",
          description: "Nome da diretriz ou linguagem (ex: 'typescript', 'python', 'code-style', 'project-webapp')."
        },
        content: {
          type: "string",
          description: "Conteúdo markdown da diretriz para ação 'write'."
        }
      }
    }
  },
  {
    name: "get_pending_reviews",
    description: "Retorna o relatório de notas que aguardam revisão humana (verified_by_reviewer: false) com suporte a paginação e resumo agrupado por pasta.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "Quantidade máxima de notas pendentes a retornar (padrão: 20, máximo: 50)."
        },
        offset: {
          type: "integer",
          description: "Índice inicial para paginação (padrão: 0)."
        },
        pathPrefix: {
          type: "string",
          description: "Filtro por caminho/pasta (ex: 'imported/', '_shared/', 'proj-webapp/')."
        }
      }
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
          enum: ["list", "read", "write", "delete"],
          description: "Ação a executar: 'list' (listar agentes), 'read' (ler prompt), 'write' (criar/evoluir agente), 'delete' (remover agente)."
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
        targetDir: { type: "string", description: "Diretório opcional a ser validado, relativo à raiz do projeto." },
        verbose: { type: "boolean", description: "Se true, exibe a lista detalhada de warnings por arquivo. Padrão é false (exibe resumo compacto)." }
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
