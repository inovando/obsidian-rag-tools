/**
 * Definições de ferramentas e seus respectivos schemas JSON-RPC para o Obsidian RAG MCP.
 * Compartilhado entre o servidor MCP e o gerador de configurações de setup.
 */

const tools = [
  {
    name: "query_knowledge_base",
    description: "Busca notas de referência no vault Obsidian usando tags, tópico e palavras-chave. Retorna as 5 notas mais relevantes.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Texto da consulta livre (palavras-chave a buscar)."
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Lista de tags para filtrar (ex: ['nodejs', 'hooks', 'orm'])."
        },
        topic: {
          type: "string",
          description: "Tópico específico para correspondência no frontmatter."
        }
      }
    }
  },
  {
    name: "read_note",
    description: "Lê o conteúdo completo de uma nota no vault pelo caminho relativo. Retorna frontmatter, conteúdo markdown, e metadados.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Caminho relativo da nota dentro do vault (ex: fintech-architecture/01-visao-geral.md)."
        }
      },
      required: ["filePath"]
    }
  },
  {
    name: "write_note",
    description: "Cria ou atualiza uma nota de referência no vault. Valida frontmatter, links e placeholders antes de salvar.",
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
    name: "move_note",
    description: "Move ou renomeia uma nota (arquivo) no vault RAG de um caminho de origem para um caminho de destino, ambos relativos à pasta de referências.",
    inputSchema: {
      type: "object",
      properties: {
        oldFilePath: {
          type: "string",
          description: "Caminho relativo de origem da nota (ex: nodejs/event-loop.md)."
        },
        newFilePath: {
          type: "string",
          description: "Caminho relativo de destino da nota (ex: nodejs/event-loop-v2.md)."
        }
      },
      required: ["oldFilePath", "newFilePath"]
    }
  },
  {
    name: "delete_note",
    description: "Remove/deleta uma nota (arquivo) no vault RAG pelo seu caminho relativo.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Caminho relativo da nota a ser removida (ex: nodejs/event-loop.md)."
        }
      },
      required: ["filePath"]
    }
  },
  {
    name: "validate_vault",
    description: "Executa a ferramenta de validação automatizada no vault RAG para verificar a integridade da estrutura, frontmatter do YAML, limites de linha das notas e links wiki/markdown.",
    inputSchema: {
      type: "object",
      properties: {
        targetDir: {
          type: "string",
          description: "Diretório opcional a ser validado, relativo à raiz do projeto. O padrão é a raiz do projeto."
        }
      }
    }
  },
  {
    name: "get_mcp_metrics",
    description: "Retorna o relatório operacional do MCP: latência, consultas, erros e tokens consumidos.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  }
];

module.exports = {
  tools
};
