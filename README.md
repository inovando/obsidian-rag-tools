# @inovan.do/obsidian-rag-tools (v1.2.0)

Ferramentas CLI e Servidor MCP avançados para criar, validar, indexar vetores, importar repositórios, gerenciar diretrizes e servir bases de conhecimento RAG (Retrieval-Augmented Generation) no Obsidian para IAs (Claude, Cursor, Antigravity, VS Code).

---

## ⚡ Recursos Principais da v1.2.0

- **🧠 Banco Vetorial & Busca Semântica Local (Local RAG)**:
  - Embeddings executados **100% offline** via `@xenova/transformers` (modelo ONNX `all-MiniLM-L6-v2` via WebAssembly, 0 dependências nativas C++).
  - **Busca Híbrida RRF (Reciprocal Rank Fusion)**: Combina busca por palavras-chave/tags (BM25) com similaridade vetorial por significado (Cosseno em `Float32Array`).
- **📐 Sistema de Diretrizes de Projeto & Linguagem (`manage_guidelines`)**:
  - Armazena e compartilha padrões de código, convenções e regras por linguagem (`.agents/guidelines/languages/typescript.md`, `python.md`) e por projeto (`.agents/guidelines/projects/`).
  - Permite listar, ler e atualizar diretrizes para que a referência nunca se perca entre sessões de IA.
- **👥 Time de Agentes Especializados Evolutivos (`.agents/profiles/`)**:
  - Salva e gerencia perfis de agentes no próprio vault (`architect.md`, `reviewer.md`). Ferramenta MCP `manage_agent_profile` para listar, ler e evoluir prompts de sistema.
- **🧠 Sistema de Skills Integrado (`.agents/skills/`)**:
  - Manuais técnicos e checklists por tecnologia (`langchain`, `spec-driven-dev`). Ferramentas MCP `list_skills` e `read_skill`.
- **📦 Importador Automático de Repositórios (`obsidian-rag-import`)**:
  - Converte pastas e repositórios markdown externos em notas RAG modulares com frontmatter YAML, dividindo automaticamente arquivos extensos em notas de <=200 linhas conectadas por `[[wiki-links]]`.
- **🔎 CLI Interativa de Busca (`obsidian-rag-query`)**:
  - Teste consultas semânticas vetoriais diretamente no terminal exibindo scores e trechos formatados.
- **🧠 Memória Contínua entre Sessões (`manage_session_memory`)**:
  - Armazena contexto ativo, decisões tomadas e próximos passos em `.obsidian/session_memory.json`.
- **📌 Relatório de Revisões Pendentes (`get_pending_reviews`)**:
  - Ferramenta 100% somente leitura que reporta notas que aguardam revisão humana (`verified_by_reviewer: false`).
- **📖 Leitura Parcial de Notas (Economia de Tokens)**:
  - `read_note` com suporte a filtros por `heading` (ler apenas um cabeçalho), `startLine`/`endLine` ou `summaryOnly`.

---

## 🚀 Guia de Instalação e Uso

### Opção A: Instalação Global (Recomendado)
A forma mais simples e rápida de usar as CLI ferramentas no terminal:
```bash
npm i -g @inovan.do/obsidian-rag-tools
```

Após instalar globalmente, execute os comandos diretamente no diretório do seu vault:
```bash
obsidian-rag-init       # 1. Inicializar estrutura do vault (templates/, references/, AGENTS.md)
obsidian-rag-setup      # 2. Configurar MCP e regras no Claude, Cursor, Antigravity, VS Code
obsidian-rag-index      # 3. Gerar/Atualizar o banco vetorial RAG (.obsidian/rag-index.json)
obsidian-rag-validate   # 4. Validar integridade e links do vault
```

---

### Opção B: Uso Sem Instalação via `npx` (Usando `-p`)
Caso prefira não instalar globalmente, use o parâmetro `-p` (`--package`) para informar o pacote escopado ao `npx`:

```bash
npx -p @inovan.do/obsidian-rag-tools obsidian-rag-init
npx -p @inovan.do/obsidian-rag-tools obsidian-rag-setup
npx -p @inovan.do/obsidian-rag-tools obsidian-rag-index
npx -p @inovan.do/obsidian-rag-tools obsidian-rag-validate
```

---

## 🛠️ Suíte Completa de 14 Ferramentas MCP

| Ferramenta MCP | Descrição |
| :--- | :--- |
| `manage_guidelines` | Gerencia e consulta as diretrizes de código do projeto e das linguagens em `.agents/guidelines/`. |
| `query_knowledge_base` | Busca híbrida RRF (Palavras-Chave + Similaridade Vetorial). Suporta `compact: true`. |
| `read_note` | Lê nota completa ou parcial por `heading`, `startLine`/`endLine` ou `summaryOnly`. |
| `write_note` | Cria/atualiza notas validadas com limite de 200 linhas e reindexação incremental. |
| `get_pending_reviews` | Relatório somente leitura de notas aguardando revisão humana. |
| `list_skills` | Lista todas as skills cadastradas em `.agents/skills/`. |
| `read_skill` | Carrega o manual e checklist de uma skill técnica. |
| `manage_agent_profile` | Lista, lê ou atualiza/evolui prompts de agentes em `.agents/profiles/`. |
| `manage_session_memory` | Gerencia a memória contínua de sessão em `.obsidian/session_memory.json`. |
| `reindex_vault` | Re-indexa todos os embeddings semânticos em `.obsidian/rag-index.json`. |
| `validate_vault` | Executa a validação automatizada de links, schemas e limites de linha. |
| `move_note` | Renomeia ou move notas preservando referências. |
| `delete_note` | Remove nota do vault. |
| `get_mcp_metrics` | Retorna métricas de latência e consumo de tokens. |

---

## 📄 Licença

ISC - **inovan.do**
