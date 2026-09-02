# @inovan.do/obsidian-rag-tools (v1.2.0)

Ferramentas CLI e Servidor MCP avançados para criar, validar, indexar vetores, importar repositórios e servir bases de conhecimento RAG (Retrieval-Augmented Generation) no Obsidian para IAs (Claude, Cursor, Antigravity, VS Code).

---

## ⚡ Novos Recursos da v1.2.0

- **🧠 Banco Vetorial & Busca Semântica Local (Local RAG)**:
  - Embeddings executados **100% offline** via `@xenova/transformers` (modelo ONNX `all-MiniLM-L6-v2` via WebAssembly, 0 dependências nativas C++).
  - **Busca Híbrida RRF (Reciprocal Rank Fusion)**: Combina busca por palavras-chave/tags (BM25) com similaridade vetorial por significado (Cosseno em `Float32Array`).
  - Suporte a busca compacta (`compact: true`) economizando até 70% de tokens.
- **📦 Importador Automático de Repositórios (`obsidian-rag-import`)**:
  - Converte pastas e repositórios markdown externos (ex: repositórios de estudo, arquitetura, `mba-ia`) em notas RAG modulares com frontmatter YAML, dividindo automaticamente arquivos extensos em notas de <=200 linhas conectadas por `[[wiki-links]]`.
- **🔎 CLI Interativa de Busca (`obsidian-rag-query`)**:
  - Teste consultas semânticas vetoriais diretamente no terminal exibindo scores e trechos formatados.
- **👥 Time de Agentes Especializados Evolutivos (`.agents/profiles/`)**:
  - Salva e gerencia perfis de agentes no próprio vault (`architect.md`, `reviewer.md`, `langchain-specialist.md`). Ferramenta MCP `manage_agent_profile` para listar, ler e evoluir prompts de sistema.
- **💡 Sistema de Skills Integrado (`.agents/skills/`)**:
  - Manuais técnicos e checklists por tecnologia (`langchain`, `spec-driven-dev`). Ferramentas MCP `list_skills` e `read_skill`.
- **🧠 Memória Contínua entre Sessões (`manage_session_memory`)**:
  - Armazena contexto ativo, decisões tomadas e próximos passos em `.obsidian/session_memory.json`.
- **📌 Relatório de Revisões Pendentes (`get_pending_reviews`)**:
  - Ferramenta 100% somente leitura que reporta notas que aguardam validação humana (`verified_by_reviewer: false`).
- **📖 Leitura Parcial de Notas (Economia de Tokens)**:
  - `read_note` com suporte a filtros por `heading` (ler apenas um cabeçalho), `startLine`/`endLine` ou `summaryOnly`.

---

## 🚀 Guia de Comandos CLI

### 1. Setup Automático do MCP e Regras de IA
```bash
npx -y --package=@inovan.do/obsidian-rag-tools obsidian-rag-setup
```

### 2. Indexação Vetorial (Gerar Banco Vetorial RAG)
```bash
npx -y --package=@inovan.do/obsidian-rag-tools obsidian-rag-index [caminho-do-vault]
```

### 3. Ingestão / Importação de Repositório Externo
```bash
npx -y --package=@inovan.do/obsidian-rag-tools obsidian-rag-import /caminho/para/projeto-externo
```

### 4. Busca Semântica pelo Terminal
```bash
npx -y --package=@inovan.do/obsidian-rag-tools obsidian-rag-query "como funciona concorrência assíncrona no Node"
```

### 5. Validador do Vault
```bash
npx -y --package=@inovan.do/obsidian-rag-tools obsidian-rag-validate
```

---

## 🛠️ Suíte Completa de Ferramentas MCP

| Ferramenta MCP | Descrição |
| :--- | :--- |
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
