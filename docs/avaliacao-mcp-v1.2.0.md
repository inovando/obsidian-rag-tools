# Relatório de Análise — MCP `@inovan.do/obsidian-rag-tools` v1.2.0

| | |
|---|---|
| **Data do teste** | 2026-09-02 |
| **Versão** | 1.2.0 (`package.json`) |
| **Vault** | `/home/jean/Projects/local_rag_obisidian_project` |
| **Escala** | 596 arquivos · 2.815 chunks vetoriais · ~333.578 tokens |
| **Método** | Execução real das 14 ferramentas MCP + leitura do código-fonte para confirmar causa-raiz |
| **Modelo de embeddings** | `all-MiniLM-L6-v2` (ONNX/WASM, offline) |

---

## Sumário executivo

**11 de 14 ferramentas funcionam corretamente.** A camada de **escrita, validação e memória** é
o ponto forte do pacote e está pronta para uso em produção. A camada de **busca (o "R" do RAG)
está degradada** e não é confiável nesta versão.

O achado central: em **4 consultas de teste, a nota correta nunca ficou em 1º lugar**. Em um dos
casos, a nota que continha o texto **literal** da consulta — e o maior score semântico do vault
(0.695) — ficou em **último lugar**, atrás de uma nota com score semântico 0.355. A causa é que a
função de "BM25" é uma contagem bruta de substring sem normalização, dominada por stopwords.

Somado a isso, os três parâmetros que deveriam controlar custo e precisão da busca
(`compact`, `tags`, `topic`) **não têm implementação funcional**.

### Veredito

| Camada | Avaliação |
|---|---|
| Escrita e validação (`write_note`, `validate_vault`, `move`/`delete`) | ✅ **Sólida** — melhor componente do pacote |
| Governança (skills, guidelines, profiles, session memory) | ✅ **Sólida** — diferencial real, resolve continuidade entre sessões |
| Indexação vetorial (`reindex_vault`, incremental) | ✅ **Funcional** — P95 122ms sobre 2.815 chunks, offline |
| **Busca / recuperação (`query_knowledge_base`)** | ❌ **Não confiável** — ranking invertido |
| **Relatórios (`get_pending_reviews`, métricas)** | ❌ **Inutilizável / impreciso** |

### Prioridade de correção

| Ordem | Bug | Impacto |
|---|---|---|
| 1º | **B1** — ranking RRF/BM25 | Torna o RAG inútil na prática |
| 2º | **B7** — `compact`/`tags`/`topic` mortos | Custo de tokens e precisão sem controle |
| 3º | **B2** — `get_pending_reviews` sem paginação | Ferramenta 100% inacessível |
| 4º | **B3** — gate do `validate_vault` | Impede uso em CI/pre-commit |

B1 e B7 são as duas que mudam a experiência de uso.

---

## 1. Matriz de resultados por ferramenta

| # | Ferramenta | Status | Observação |
|---|---|---|---|
| 1 | `query_knowledge_base` | ❌ **Degradado** | Ranking invertido (B1) + 3 parâmetros mortos (B7) |
| 2 | `read_note` | ⚠️ Parcial | 4 modos de filtro funcionam, mas duplica frontmatter (B5) |
| 3 | `write_note` | ✅ OK | Bloqueou wiki-link órfão e >200 linhas; índice incremental confirmado |
| 4 | `get_pending_reviews` | ❌ **Inutilizável** | 117.651 caracteres, sem paginação (B2) |
| 5 | `list_skills` | ✅ OK | 6 skills listadas |
| 6 | `read_skill` | ✅ OK | Manual + checklist completos |
| 7 | `manage_agent_profile` | ✅ OK | `list`/`read`/`write` OK; falta `delete` (B6) |
| 8 | `manage_guidelines` | ✅ OK | `list`/`read`/`write` OK; falta `delete` (B6) |
| 9 | `manage_session_memory` | ✅ OK | `save` faz **merge** de campos omitidos (comportamento correto) |
| 10 | `reindex_vault` | ✅ OK | 596 arquivos → 2.815 chunks |
| 11 | `validate_vault` | ⚠️ Parcial | Funciona, mas saída poluída e critério de falha inútil (B3) |
| 12 | `move_note` | ✅ OK | Move preservando frontmatter |
| 13 | `delete_note` | ✅ OK | Remove do disco **e** do índice vetorial |
| 14 | `get_mcp_metrics` | ⚠️ Parcial | P50 9ms / P95 122ms; contador de tokens subestimado (B4) |

---

## 2. Log de evidências

### 2.1 Testes que passaram

| Teste | Entrada | Resultado |
|---|---|---|
| Validação de link órfão | `write_note` com `[[nota-que-nao-existe-xyz]]` | ✅ Rejeitado: `Broken wiki-link: [[nota-que-nao-existe-xyz]]` |
| Limite de linhas | `write_note` com 205 linhas | ✅ Rejeitado: `exceeds line limit of 200 lines` |
| Escrita válida | Nota de 17 linhas | ✅ Frontmatter YAML + `token_density` gerados |
| **Indexação incremental** | Nota com termo único `zebraquixote7788`, query imediata sem reindex | ✅ Encontrada em **1º lugar** (semantic 0.433) |
| `move_note` | `teste-suite-v120.md` → `-movido.md` | ✅ Movida, frontmatter intacto |
| `delete_note` + índice | Delete e re-query do termo único | ✅ Removida do disco e do índice |
| `read_note` (4 modos) | `summaryOnly`, `heading`, `startLine/endLine`, completo | ✅ Todos os filtros aplicados corretamente |
| `manage_session_memory` merge | `save` só com `context` | ✅ `decisions` e `nextSteps` preservados |
| `reindex_vault` | Vault completo | ✅ 596 arquivos / 2.815 chunks |

### 2.2 Prova do ranking invertido (B1)

**Consulta:** `"Teste de Suíte MCP v1.2.0 nota temporária validar move_note delete_note"`
(texto praticamente literal da nota criada momentos antes)

| Posição | Nota | Semantic | Keyword | RRF |
|---|---|---|---|---|
| 1º | `imported/spec-driven-dev/.../skill-parte-3.md` | 0.355 | 124 | 0.028 |
| 2º | `imported/prompt-enginering/.../migration-quality-validator-parte-1.md` | 0.343 | 74 | 0.025 |
| 3º | `imported/desafios/.../audit-project-1.md` | 0.356 | 55 | 0.024 |
| 4º | `rimatur/precificacao/premissa-validacao-cenario-real-front.md` | 0.353 | 50 | 0.023 |
| **5º** | **`_tmp-mcp-test/teste-suite-v120-movido.md`** ← a resposta | **0.695** | 20 | 0.021 |

A nota com **o dobro** do score semântico do 1º colocado ficou em último.

**Segunda consulta:** `"Como funciona validação de schema com Yup em formulários React?"`

| Posição | Nota | Semantic | Keyword |
|---|---|---|---|
| 1º | `proj-rimatur/precificacao/processo-precificacao-nao-tecnico.md` | 0.518 | **267** |
| 2º | `proj-rimatur/precificacao/processo-precificacao-tecnico.md` | 0.528 | 212 |
| 3º | `proj-rimatur/precificacao/regras-implementadas-precificacao.md` | 0.503 | 103 |
| 4º | `fintech-architecture/06-roadmap-implementacao.md` | 0.518 | 83 |
| **5º** | **`_shared/yup/shared-yup-validation-patterns.md`** ← a resposta | **0.538** | 65 |

Quatro notas de precificação de transporte vieram antes da única nota sobre Yup do vault.
O keyword score 267 da 1ª colocada vem de stopwords (`de`, `com`, `em`, `a`), não de termos úteis.

### 2.3 Prova dos parâmetros mortos (B7)

| Teste | Entrada | Esperado | Obtido |
|---|---|---|---|
| `compact` | Mesma query com `true` e `false` | Saída reduzida em ~70% | **Saída byte-idêntica** |
| `tags` | `tags: ["stack/yup"]` | Só notas com a tag | 5 notas, **nenhuma** com a tag |
| `topic` | `topic: "Yup — Schema Validation Patterns"` + query `"event loop"` | Só a nota do tópico | Notas de event loop em 1º e 2º |
| Limiar de score | Query `zebraquixote7788` após o delete (0 matches) | 0 resultados | **5 notas irrelevantes** (keyword 0) |

---

## 3. Análise de causa-raiz

### B1 — CRÍTICO: função de keyword não é BM25

`lib/tools/query.js:59-72`:

```js
if (lowerQuery) {
  const body = note.content.toLowerCase();
  const queryWords = lowerQuery.split(/\s+/).filter(Boolean);
  for (const word of queryWords) {
    const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const count = (body.match(regex) || []).length;
    score += count;   // ← contagem bruta, sem IDF, sem normalização
  }
}
```

Três defeitos acumulados:

1. **Sem normalização por tamanho do documento** → uma nota de 200 linhas acumula ~10× mais
   ocorrências que uma de 20 linhas, independentemente de relevância.
2. **Sem IDF e sem stopwords** → `de`, `com`, `em`, `a` casam centenas de vezes. É daí que sai o
   keyword 267 da nota de precificação.
3. **Sem `\b` na regex** → `a` casa dentro de qualquer palavra; a busca é substring, não por termo.

### B1b — a fusão RRF é assimétrica

`lib/tools/query.js:84-101` e `115-146`:

```js
// candidatos keyword: TODAS as 596 notas, sem limite
const keywordScored = notes
  .map(n => ({ note: n, score: scoreNoteKeyword(n, query, tags, topic) }))
  .filter(n => n.score > 0)
  .sort((a, b) => b.score - a.score);

// candidatos vetoriais: apenas 10 chunks (→ ~5-8 arquivos únicos)
vectorResults = await searchVectorStore(targetDir, query, 10);

// fusão com pesos simétricos
const K = 60;
const rrfKw  = kw  ? 1 / (K + kw.rank)  : 0;
const rrfVec = vec ? 1 / (K + vec.rank) : 0;
const rrfScore = rrfKw + rrfVec;
```

A lista keyword é **ilimitada** enquanto a vetorial é capada em **10 chunks** sobre um vault de
**2.815 chunks** (janela de recall de 0,36%). Notas que aparecem só no keyword inundam o topo com
`1/61`, `1/62`, `1/63`…, e uma nota semanticamente perfeita que não esteja no topo do keyword não
consegue competir. A aritmética confere com a evidência: a nota de precificação obteve
rank keyword 1 + rank vetorial 2 → `1/61 + 1/62 = 0.0325` ≈ **0.031 reportado**.

**Patch sugerido:**

```js
// 1. stopwords + fronteira de palavra + normalização por tamanho
const STOPWORDS = new Set(['de','da','do','com','em','a','o','e','para','que','no','na','como','um','uma']);
const words = lowerQuery.split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w));
const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
score += count / Math.log2(2 + (note.frontmatter?.token_density?.line_count || 50));

// 2. simetrizar os candidatos
const keywordTop = keywordScored.slice(0, 50);
vectorResults = await searchVectorStore(targetDir, query, 50);

// 3. ponderar a favor do semântico
const rrfScore = 0.4 * rrfKw + 0.6 * rrfVec;
```

### B2 — CRÍTICO: `get_pending_reviews` sem paginação

Retorna **todas** as notas com `verified_by_reviewer: false` em uma resposta única:
**117.651 caracteres / 567 linhas**, recusada pelo cliente MCP por exceder o limite de tokens.
Como praticamente todo o vault está não-verificado (é o estado natural), a ferramenta **nunca**
é utilizável na prática.

**Correção:** parâmetros `limit` / `offset` / `pathPrefix` e um resumo agregado por pasta
(ex.: `references/imported/ — 312 notas pendentes`) em vez da lista completa.

### B3 — `validate_vault`: saída poluída e gate inútil

1. **Debug esquecido em produção:** imprime `DEBUG: Scanned files: [...]` com os 596 caminhos —
   sozinho isso já consome milhares de tokens e forçou truncamento de 73.521 caracteres.
2. **Critério de falha inútil:** retorna **exit 1 / FAILED** por `Note is not verified by reviewer`,
   que é o estado normal de quase todas as notas. Impossibilita uso em CI ou pre-commit hook.
3. **Mensagens duplicadas:** `Note is not verified by reviewer` e
   `Note is not verified by reviewer (pending human review)` aparecem em blocos separados
   para os mesmos arquivos.
4. **Bug de varredura de caminho:** `.obsidian/.obsidian/.obsidian/2026-08-21.md` — path
   concatenado três vezes.

**Correção:** remover o `DEBUG`, separar `errors` (frontmatter ausente, limite de linhas,
link quebrado, `token_density` divergente) de `warnings` (revisão humana pendente) e
falhar apenas em `errors`.

**Problemas reais que a ferramenta encontrou corretamente** (o valor dela é legítimo):
`references/technical/otlearning-*.md` sem frontmatter YAML · 3 notas Luccaro >200 linhas ·
`templates/spec_template.md` com `token_density` divergente · wiki-links órfãos em
`llm_context/project-webapp.md`.

### B4 — `get_mcp_metrics` subestima o custo de tokens

Fim de `handleQueryKnowledgeBase`:

```js
const tokens = Math.round((query.length + JSON.stringify(tags).length + topic.length) / 4);
```

Conta apenas o **texto da consulta de entrada**, ignorando todo o payload devolvido
(5 notas × até 600 caracteres de excerpt + frontmatter completo). O consumo real por query é
**~10–20× o reportado**, então os 175.361 tokens acumulados não representam o custo efetivo —
justamente a métrica que mais importa em um MCP focado em economia de contexto.

### B5 — `read_note` duplica o frontmatter

O cabeçalho da resposta já imprime o frontmatter completo. Com `startLine`/`endLine` as linhas são
contadas sobre o **arquivo bruto**, incluindo o frontmatter. Resultado real de
`startLine: 1, endLine: 12`:

```
**Arquivo:** _shared/yup/shared-yup-validation-patterns.md [Filtro Aplicado: lines:1-12]
---
topic: Yup — Schema Validation Patterns      ← frontmatter (1ª vez, do cabeçalho)
...
---
---
topic: Yup — Schema Validation Patterns      ← frontmatter (2ª vez, como "conteúdo")
...
```

Zero linhas de conteúdo útil e o frontmatter em duplicidade — o oposto exato da economia de
tokens prometida.

**Correção:** contar `startLine`/`endLine` a partir do corpo (pós-frontmatter) e omitir o
frontmatter do cabeçalho quando um filtro de linha ou heading está ativo.

### B6 — Sem ação `delete` em `manage_guidelines` e `manage_agent_profile`

Ambas expõem apenas `list` / `read` / `write`. Diretrizes e perfis criados por engano só podem ser
removidos manualmente pelo filesystem — foi o que precisei fazer para limpar este teste
(`rm .agents/guidelines/projects/tmp-mcp-qa-test.md`). Em uma suíte cujo objetivo é deixar a IA
gerenciar o vault, isso obriga intervenção humana fora do MCP.

### B7 — Parâmetros documentados sem implementação

| Parâmetro | Onde está declarado | Comportamento real |
|---|---|---|
| `compact` | `lib/schemas.js:26` | **Morto.** Nunca lido em `lib/tools/query.js`. Saída byte-idêntica com `true`/`false`. A economia de "até 70% de tokens" anunciada no README **não ocorre**. |
| `tags` | `lib/tools/query.js:82` | **Não filtra.** Apenas soma `+20` (match exato) / `+5` (parcial) no score keyword. |
| `topic` | `lib/tools/query.js:83` | **Não filtra.** Apenas soma `+30` (match exato) / `+10` (parcial). |

Além disso, não há parâmetro `limit` nem limiar de score: `.slice(0, 5)` é fixo e devolve sempre
5 notas, mesmo quando todas têm keyword 0 e nenhuma relevância.

**Correção:** implementar `compact` (omitir `excerpt`), transformar `tags`/`topic` em pré-filtro
duro sobre o conjunto de candidatos (antes do ranking, aplicado também ao vetorial) e adicionar
`limit` + `minScore`.

### B8 — Wiki-links de skills e perfis não são validados

`.agents/skills/yup/SKILL.md` referencia `[[_shared/yup/validation-patterns]]`, mas a nota real é
`_shared/yup/shared-yup-validation-patterns.md`. `validate_vault` não cobre o diretório
`.agents/`, então referências quebradas em skills e perfis passam silenciosamente — e o agente
que ler a skill vai tentar abrir um caminho inexistente.

---

## 4. Avaliação de uso do MCP

### O que está sólido

**`write_note` é o melhor componente do pacote.** O gate de qualidade funciona de verdade:
rejeitou wiki-link órfão e nota de 205 linhas, gerou frontmatter com `token_density` calculado e
reindexou incrementalmente — verificado com um termo único que apareceu em 1º lugar
imediatamente após a escrita, sem `reindex_vault`. `delete_note` limpa o índice junto.

**A camada de governança é o diferencial real.** Skills, guidelines, profiles e session memory
funcionam bem e resolvem um problema concreto: continuidade de contexto entre sessões de IA.
`manage_session_memory` faz merge correto de campos omitidos. As skills são bem escritas
(a de Yup traz pitfalls e checklist de geração de código acionáveis).

**Infraestrutura vetorial adequada.** Embeddings offline sem dependência nativa C++, P95 de
122ms sobre 2.815 chunks e 596 arquivos. A base técnica está correta — o problema está na
camada de ranking, não na de embeddings.

### O que impede o uso como RAG

**O recall.** Em 4 consultas, a nota correta nunca ficou em 1º lugar; uma vez ficou em último com
o dobro do score semântico do 1º colocado. Na prática o agente recebe 5 notas em que a útil está
enterrada na 5ª posição, paga tokens por 4 excerpts irrelevantes de até 600 caracteres cada e
tende a responder com base nas primeiras — exatamente o oposto da proposta do pacote.

**Falta de controle de custo.** `compact`, `tags` e `topic` são os três mecanismos de controle de
precisão e consumo de contexto expostos pela API, e nenhum tem implementação funcional. Sem
`limit` nem `minScore`, toda query custa o mesmo, independentemente de haver ou não resultado.

**Ironia estrutural:** as duas ferramentas mais caras em tokens são justamente as que deveriam
economizá-los — `query_knowledge_base` (`compact` morto) e `read_note` (frontmatter duplicado) —
enquanto `get_pending_reviews` e `validate_vault` estouram o limite do cliente por não paginarem.

### Recomendação

Manter o uso do MCP para **escrita, validação e governança** — nessas funções ele já entrega
valor e o gate de qualidade evita lixo no vault (58 erros de validação evitados segundo as
métricas). Para **recuperação**, tratar os resultados com desconfiança nesta versão: vale ler os
5 retornos e escolher pelo `Semantic Score` em vez da ordem apresentada, até B1 ser corrigido.

---

## 5. Limpeza executada

| Item | Ação |
|---|---|
| `_tmp-mcp-test/teste-suite-v120-movido.md` | Removida via `delete_note` |
| `_tmp-mcp-test/zebra-quixote-marcador.md` | Removida via `delete_note` |
| `_tmp-mcp-test/` (diretório) | Removido |
| `.agents/guidelines/projects/tmp-mcp-qa-test.md` | Removido manualmente (sem ação `delete` no MCP) |
| `.agents/profiles/tmp-mcp-qa-tester.md` | Removido manualmente (sem ação `delete` no MCP) |
| Memória de sessão | Restaurada ao conteúdo original |

**Estado final verificado:** 3 diretrizes · 2 perfis · 6 skills — idêntico ao estado inicial.
