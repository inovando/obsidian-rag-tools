# Verificação — v1.2.3 (pacote publicado no npm)

| | |
|---|---|
| **Versão testada** | **1.2.3 instalada do npm** (`npm i @inovan.do/obsidian-rag-tools@1.2.3`) |
| **Commit** | `13a9c21` — *fix(rag): corrigir R3 (pathPrefix no pending.js) e B3 (summary & stdout de warnings)* |
| **Publicado em** | 2026-09-03T15:53:22Z |
| **Data do teste** | 2026-09-03 |
| **Método** | JSON-RPC stdio real contra o `mcp-server.js` **do pacote publicado**, apontado ao vault real via `OBSIDIAN_VAULT_PATH`; contagem independente do vault como verdade de campo |

> Este teste roda o pacote **como o usuário final o recebe** — instalado do registro, não a cópia
> de trabalho local.

---

## Veredito

| Item | Status |
|---|---|
| **R3** — `pathPrefix` descartava notas | ✅ **Corrigido** |
| **B3** — payload de 22k tokens + rótulo "Erros" | ✅ **Corrigido** |
| **B2** — paginação | ✅ Mantido |
| **Busca (B1/R1)** | ✅ Sem regressão: 25/26 (96%), MRR 0.981 |
| **B5** — `read_note` duplica frontmatter | ❌ Ainda aberto |
| **B6** — sem `delete` em guidelines/profiles | ❌ Ainda aberto |
| **V1** — banner do servidor diz `v1.2.1` (**novo**) | ⚠️ Cosmético |

**Nenhum bloqueador restante.** Os dois itens abertos (B5, B6) são de baixo impacto e não afetam
busca, escrita ou validação.

---

## 1. R3 — corrigido ✅

O `return` dentro do `for...of` virou `continue` (`lib/tools/pending.js:40` no pacote publicado).
Todos os valores passaram a bater com a contagem independente do vault:

| `pathPrefix` | Verdade de campo | v1.2.2 | **v1.2.3** |
|---|---|---|---|
| `imported/arquitetura/rag` | **8** | ❌ *"Nenhuma nota pendente"* | ✅ **8** |
| `imported/arquitetura/cache` | 14 | 14 | ✅ 14 |
| `_shared/` | 5 | 5 | ✅ 5 |
| `imported/` | 483 | 483 | ✅ 483 |
| *(sem filtro)* | 565 | 565 | ✅ 565 |

E o `vaultTotalPending`, que era inconsistente, agora é **565 em todas as chamadas**:

| Chamada | v1.2.2 | **v1.2.3** |
|---|---|---|
| `pathPrefix: "_shared/"` | 54 ❌ | **565** ✅ |
| `pathPrefix: "imported/"` | 506 ❌ | **565** ✅ |
| `pathPrefix` inexistente | 50 ❌ | **565** ✅ |

O falso negativo silencioso — a ferramenta afirmar que não havia pendências onde havia 8 —
desapareceu.

## 2. B3 — corrigido ✅

Os warnings passaram para `stdout` e são agregados por pasta e por categoria, com dica de
`--verbose` para o detalhamento.

| | v1.2.2 | **v1.2.3** |
|---|---|---|
| Payload | 89.628 chars / 1.228 linhas / **~22.407 tokens** | **4.133 chars / 68 linhas / ~1.033 tokens** |
| Redução | — | **−95,4%** |
| Seção `**Erros (stderr):**` com warnings dentro | presente ❌ | **ausente** ✅ |
| Warnings listados um a um | 642 | **0** (agregados) ✅ |
| Dump `DEBUG: Scanned files` | ausente | ausente ✅ |
| Gate | `0 errors, 642 warnings` → PASSED | idem ✅ |

Saída atual:

```
**Validação do Vault: ✅ PASSED** (Exit Code: 0)

--- Warnings Summary (642 total) ---
By Folder:
  - llm_context/: 3 warnings
  - references/: 637 warnings
  - templates/: 2 warnings
By Category:
  - 570x Note is not verified by reviewer (pending human review)
  - 10x contains placeholder: 'TODO' (imported note)
  - 1x exceeds recommended line limit of 200 (actual: 247 lines)
  ...
(Pass --verbose flag to list all individual file warnings)
```

**Observação (não é bug):** a seção *By Category* ainda gera ~50 linhas porque a categoria é a
mensagem **completa**, e mensagens que embutem caminho (`Markdown link target not found (example
link): ./ADR-010-cors-wildcard.md`) criam uma categoria única cada. Normalizar pelo **tipo** da
mensagem — descartando o caminho — reduziria o resumo a ~6 linhas. É a diferença entre 1.033 e
~250 tokens; vale se quiser apertar mais.

## 3. Busca — sem regressão ✅

Benchmark de 26 consultas executado **com o pacote publicado**, contra o vault e o índice reais:

| Métrica | v1.2.2 | **v1.2.3 (npm)** |
|---|---|---|
| Grupo A — R@1 (PT → nota EN) | 15/16 (94%) | **15/16 (94%)** |
| Grupo B — R@1 (PT → nota PT) | 10/10 (100%) | **10/10 (100%)** |
| **TOTAL — R@1** | 25/26 (96%) | **25/26 (96%)** |
| **TOTAL — R@3** | 26/26 | **26/26** |
| **TOTAL — MRR** | 0.981 | **0.981** |

Modelo confirmado no pacote publicado: `Xenova/multilingual-e5-small`.

## 4. B2 — mantido ✅

| Chamada | Chars | ~Tokens | Notas |
|---|---|---|---|
| padrão | 3.785 | 946 | 20 |
| `limit: 5` | 1.774 | 444 | 5 |
| `limit: 99` (cap) | 8.176 | 2.044 | 50 |
| `pathPrefix: "_shared/"` | 973 | 243 | 5 |

Contra a linha de base original de **117.651 chars**: **−96,8%**.

---

## 5. Itens ainda abertos

### B5 — `read_note` continua duplicando o frontmatter ❌

`startLine: 1, endLine: 12` na nota de Yup:

```
**Arquivo:** _shared/yup/shared-yup-validation-patterns.md [Filtro Aplicado: lines:1-12]
**Linhas do Vault:** 142 | **Caracteres:** 3228

---
topic: Yup — Schema Validation Patterns     <- 1a vez (cabeçalho da resposta)
...
---
topic: Yup — Schema Validation Patterns     <- 2a vez (como "conteúdo")
```

`topic:` aparece **2x** e nenhuma linha de conteúdo real é devolvida, porque as linhas são
contadas sobre o arquivo bruto (incluindo o frontmatter). Correção: contar a partir do corpo e
omitir o frontmatter do cabeçalho quando há filtro de linha ou heading.

### B6 — sem ação `delete` ❌

```
manage_guidelines:    [list, read, write]  -> sem delete
manage_agent_profile: [list, read, write]  -> sem delete
```

Diretrizes e perfis criados por engano continuam só removíveis pelo filesystem.

### V1 — banner do servidor desatualizado (novo, cosmético) ⚠️

```
mcp-server.js:237 -> console.error("Obsidian RAG MCP Server v1.2.1 iniciado. Ready.");
package.json      -> 1.2.3
```

A string de versão está fixa no código e não acompanhou os bumps. Quem ler o log vai achar que
está numa versão antiga. Sugestão: `require('./package.json').version`.

---

## 6. Checklist consolidado

| | Item | Status |
|---|---|---|
| ☑ | **B1** — ranking RRF/BM25 | ✅ |
| ☑ | **B2** — paginação (−96,8%) | ✅ |
| ☑ | **B2b** — mensagens e rótulos | ✅ |
| ☑ | **B3** — resumo de warnings (−95,4%) | ✅ |
| ☑ | **B4** — métrica de tokens | ✅ |
| ☑ | **B7** — `compact`/`tags`/`topic`/`limit` | ✅ |
| ☑ | **B8** — wiki-links de skills | ✅ |
| ☑ | **N1–N4, N6** | ✅ |
| ☑ | **R1** — cross-lingual (69% → 96% R@1) | ✅ |
| ☑ | **R2** — guarda de índice legado | ✅ |
| ☑ | **R3** — `pathPrefix` perdia notas | ✅ |
| ☐ | **B5** — `read_note` duplica frontmatter | Aberto (baixo) |
| ☐ | **B6** — sem `delete` em guidelines/profiles | Aberto (baixo) |
| ☐ | **N5** — escala de `minScore` | Aberto (baixo) |
| ☐ | **R2b** — aviso de índice também no resultado da busca | Aberto (baixo) |
| ☐ | **V1** — banner `v1.2.1` | Aberto (cosmético) |
| ☐ | **B3b** — categoria do resumo inclui caminho | Aberto (cosmético) |

**11 de 11 itens de impacto resolvidos.** O que resta é acabamento.

---

## 7. Nota operacional

O servidor MCP em execução no cliente ainda é o processo de **02/09 12:49**, apontando para
`/home/jean/Projects/local_rag_obisidian_project/mcp-server.js`. O código local já é o da 1.2.3,
mas o processo carregou os módulos em memória há dois dias — **reinicie o Claude Code (ou
reconecte o MCP) para que as ferramentas passem a usar a versão corrigida.** Os testes deste
relatório não dependem disso: eles sobem o próprio servidor a partir do pacote instalado do npm.

## Reprodução

Em `/tmp/claude-1000/-home-jean-Projects-Rimatur/6a84597d-1133-43a7-8ff9-137a3f4c0196/scratchpad/`:
`npmtest/` (instalação limpa da 1.2.3 do npm), `retest123.js` (R3 + B2 + B3),
`b5b6.js` (B5 + B6), `bench-npm.js` (26 consultas contra o pacote publicado).
