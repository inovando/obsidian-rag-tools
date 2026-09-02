# @inovan.do/obsidian-rag-tools

Ferramentas CLI e Servidor MCP otimizados para criar, validar, indexar e servir bases de conhecimento RAG (Retrieval-Augmented Generation) no Obsidian para IAs (Claude, Cursor, Antigravity, VS Code).

---

## ⚡ Recursos Principais

- **🧠 Banco Vetorial & Busca Semântica Local (Local RAG)**:
  - Embeddings executados **100% offline** via `@xenova/transformers` (modelo ONNX `all-MiniLM-L6-v2` via WebAssembly, sem compilação C++ nativa).
  - Suporte flexível e opcional a **Ollama** (`EMBEDDING_PROVIDER=ollama`) e **OpenAI**.
  - **Busca Híbrida RRF (Reciprocal Rank Fusion)**: Combina busca por palavras-chave/tags (BM25) com similaridade vetorial por significado (Cosseno em `Float32Array`).
- **📝 Salvamento Inteligente de Notas (`write_note`)**:
  - Recálculo preciso de `token_density` (`line_count` e `character_count`) no YAML Frontmatter.
  - Validação de limite de 200 linhas por nota modular.
  - Atualização incremental automática dos vetores da nota alterada no banco vetorial `.obsidian/rag-index.json`.
- **🛠️ Setup Automático em Clientes LLM**:
  - Injeta regras de IA (`AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`) e configura o Servidor MCP automaticamente no Claude Desktop, Claude Code, Cursor, Antigravity e VS Code (Continue / Cline / Roo Code).
- **✅ Validador deVault Automatizado**:
  - Garante integridade da estrutura, frontmatter YAML, links wiki `[[note]]`, links markdown e limites de linha.

---

## 🚀 Guia de Instalação e Uso Rápido

### 1. Setup Automático de IA e MCP
Para configurar os servidores MCP e arquivos de regras no seu ambiente:

```bash
# Executar setup na raiz do seu Obsidian Vault:
npx -y @inovan.do/obsidian-rag-tools obsidian-rag-setup
```

### 2. Indexação Vetorial (Gerar Banco Vetorial RAG)
Para indexar todas as notas de referência do seu vault e gerar o banco semântico (`.obsidian/rag-index.json`):

```bash
npx -y --package=@inovan.do/obsidian-rag-tools obsidian-rag-index
```

### 3. Validação da Estrutura do Vault
Para validar a integridade de todas as notas do vault:

```bash
npx -y --package=@inovan.do/obsidian-rag-tools obsidian-rag-validate
```

### 4. Recálculo Automático de Token Density
Se modificar notas manualmente e precisar recalcular `line_count` e `character_count`:

```bash
npx -y --package=@inovan.do/obsidian-rag-tools obsidian-rag-fix-density
```

---

## 🛠️ Suíte de Ferramentas MCP (STDIO JSON-RPC 2.0)

O servidor MCP expõe as seguintes ferramentas para assistentes de IA:

| Ferramenta MCP | Descrição |
| :--- | :--- |
| `query_knowledge_base` | Realiza **Busca Híbrida RRF** (Palavras-Chave + Similaridade Vetorial) retornando os 5 trechos/notas mais relevantes com `semanticScore` e `keywordScore`. |
| `read_note` | Lê o conteúdo completo de uma nota pelo caminho relativo, incluindo frontmatter e metadados. |
| `write_note` | Cria ou atualiza uma nota no vault com validação de frontmatter, limite de 200 linhas e reindexação vetorial incremental. |
| `move_note` | Renomeia ou move uma nota preservando caminhos relativos. |
| `delete_note` | Remove uma nota do vault. |
| `validate_vault` | Executa o validador automatizado verificando estrutura, schemas YAML, links e limites de linha. |
| `reindex_vault` | Re-indexa todo o vault gerando os embeddings semânticos em `.obsidian/rag-index.json`. |
| `get_mcp_metrics` | Retorna o relatório operacional de latência, consultas e tokens consumidos. |

---

## 📂 Estrutura do Repositório e Vault

- **`/references`**: Notas de referência modulares organizadas por stack (`nodejs`, `react`, `nextjs`, `adonisjs4`, `adonisjs7`).
- **`/templates`**: Templates padronizados de notas e contextos de projetos.
- **`lib/rag/`**: Módulos do motor RAG local:
  - `embeddings.js`: Abstração de embeddings (Transformers.js ONNX, Ollama, OpenAI).
  - `chunker.js`: Fragmentador de notas markdown por seções (`#`, `##`, `###`).
  - `vectorStore.js`: Banco vetorial local (`.obsidian/rag-index.json`) com similaridade de cosseno em `Float32Array`.
- **`validate_vault.js`**: Script de validação rigorosa de notas e links.
- **`fix_token_density.js`**: Utilitário de correção de metadados de densidade.

---

## 🏷️ Schema YAML Frontmatter Exigido

Cada nota de referência deve conter o seguinte schema no frontmatter:

```yaml
---
topic: "Event Loop e Concorrência Assíncrona"
tags:
  - "_shared/nodejs"
  - "async"
sources:
  - "https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick"
verified_by_reviewer: false
last_updated: "2026-09-02T19:00:00.000Z"
token_density:
  line_count: 45
  character_count: 1420
---
```

---

## 🧪 Testes de Integração e Qualidade de Código

Para executar os testes de integração do RAG local e validação de salvamento:

```bash
node test_local_rag.js
```

---

## 📄 Licença

ISC - **inovan.do**
