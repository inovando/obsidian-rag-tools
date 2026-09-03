# Bateria Completa — v1.2.5 pelas ferramentas MCP reais

| | |
|---|---|
| **Versão** | 1.2.5 (sessão reiniciada, servidor carregado de `/home/jean/node_modules`) |
| **Data** | 2026-09-03 |
| **Método** | Chamadas às **14 ferramentas MCP** pelo cliente real (não mais servidor próprio), vault e índice reais |
| **Índice** | 595 arquivos · 2.812 chunks · `model: Xenova/multilingual-e5-small` |

---

## Veredito

**14 de 14 ferramentas funcionais.** Todos os itens das rodadas anteriores confirmados corrigidos,
incluindo B5, B6 e B3b. Dois bugs novos apareceram, ambos encontráveis só pelo caminho real do
cliente MCP — que é justamente o que esta rodada exercitou pela primeira vez.

| Item | Status |
|---|---|
| **B5** — `read_note` duplicava frontmatter | ✅ **Corrigido** |
| **B6** — sem `delete` em guidelines/profiles | ✅ **Corrigido** |
| **B3b** — categorias do resumo incluíam caminho | ✅ **Corrigido** |
| **R3** — `pathPrefix` perdia notas | ✅ Confirmado corrigido |
| **B1/R1** — ranking e cross-lingual | ✅ Semantic 0.85–0.92 nos acertos |
| **R4** — `compact: true` imprime `Trecho: undefined` (**novo**) | ❌ Baixo |
| **R5** — `move_note` não atualiza o índice vetorial (**novo**) | ❌ **Alto** |

---

## 1. Resultado das 14 ferramentas

| # | Ferramenta | Resultado |
|---|---|---|
| 1 | `get_mcp_metrics` | ✅ 572 consultas, P50 23ms, P95 429ms |
| 2 | `validate_vault` | ✅ **~1.100 chars** (era 117.651) · `0 errors, 642 warnings` · PASSED |
| 3 | `get_pending_reviews` | ✅ paginação, `offset`, `pathPrefix` e totais corretos |
| 4 | `query_knowledge_base` | ✅ ranking correto (ver R4 para o formato) |
| 5 | `read_note` | ✅ 4 modos; **B5 corrigido** |
| 6 | `write_note` | ✅ criou nota e rejeitou wiki-link órfão |
| 7 | `move_note` | ⚠️ move o arquivo, **mas não o índice** (R5) |
| 8 | `delete_note` | ✅ remove arquivo e chunks do caminho informado |
| 9 | `reindex_vault` | ✅ 595 arquivos / 2.812 chunks (~2min) |
| 10 | `list_skills` | ✅ 6 skills |
| 11 | `read_skill` | ✅ manual completo |
| 12 | `manage_guidelines` | ✅ `list`/`read`/`write`/**`delete`** |
| 13 | `manage_agent_profile` | ✅ `list`/`read`/`write`/**`delete`** |
| 14 | `manage_session_memory` | ✅ `get`/`save` (com merge)/`clear` |

## 2. Confirmações das correções

**B5 — `read_note` com `startLine: 1, endLine: 10`:** agora devolve o frontmatter **uma vez** e em
seguida o conteúdo real (`# Yup — Schema Validation Patterns`, `## Stack Coverage`, `## Schema Base`).
Antes devolvia `topic:` duas vezes e zero linhas de conteúdo.

**B6 — ação `delete`:** testada de ponta a ponta nas duas ferramentas. Criei
`qa-temp-125` como diretriz de projeto e como perfil de agente, e ambos foram removidos pelo MCP:

```
Diretriz 'qa-temp-125' (tipo: project) deletada com sucesso de .agents/guidelines/
Perfil do agente 'qa-temp-125' deletado com sucesso de .agents/profiles/
```

**B3b — categorias normalizadas.** O resumo saiu de ~50 linhas (uma por caminho) para 6:

```
--- Warnings Summary (642 total) ---
By Folder:
  - llm_context/: 3 | references/: 637 | templates/: 2
By Category:
  - 570x Note is not verified by reviewer (pending human review)
  -  33x Markdown link target not found (example link)
  -  22x exceeds recommended line limit of 200 (exceeds limit)
  -  11x contains placeholder (imported note)
  -   3x Missing YAML frontmatter (legacy note)
```

De 117.651 chars na v1.2.0 para **~1.100** — redução de **99,1%**.

**Busca:** `"Como funciona validação de schema com Yup em formulários React?"` devolve a nota de Yup
em 1º com **semantic 0.918**; `tags: ["stack/yup"]` devolve exatamente 1 nota, a correta;
`minScore: 0.04` filtrou de 5 para 1 resultado. Indexação incremental do `write_note` confirmada
(termo único achado em 1º imediatamente).

---

## 3. R5 — ALTO: `move_note` não atualiza o índice vetorial

Uma nota movida **desaparece da busca semântica** e só volta depois de um `reindex_vault` completo.

### Reprodução (determinística)

```
1. write_note _tmp-qa/r5-origem.md  (termo único "bergamota9911")
2. query "bergamota9911"  -> 1º lugar, semantic 0.853          ✅
3. move_note r5-origem.md -> r5-destino.md                     "✅ Nota movida com sucesso!"
4. query "bergamota9911"  -> NÃO encontrada                    ❌
5. índice: chunks em r5-origem = 2  |  chunks em r5-destino = 0
```

O arquivo está em disco no caminho novo (`read_note` o lê sem problema), mas o índice continua
apontando para o caminho antigo. Resultado: a nota fica invisível para o RAG.

### Agravante: os órfãos nunca são recolhidos

```
6. delete_note r5-destino.md    -> "✅ Nota deletada com sucesso!"
7. índice: chunks em r5-origem = 2   <-- PERSISTEM
```

O `delete_note` remove os chunks do caminho que recebeu, e o caminho antigo não é conhecido por
ninguém. Cada `move_note` deixa lixo permanente no `rag-index.json`, que só desaparece num
reindex completo. Num vault ativo isso infla o índice e cria candidatos para arquivos inexistentes.

### Correção

As primitivas já existem em `lib/rag/vectorStore.js`. O `move_note` precisa fazer o mesmo que o
par escrever/apagar:

```js
// em handleMoveNote, depois do fs.renameSync:
const { updateNoteInIndex } = require('../rag/vectorStore');
// 1) remove os chunks do caminho antigo (updateNoteInIndex com conteúdo vazio já filtra)
await updateNoteInIndex(targetDir, oldFilePath, '');
// 2) indexa o caminho novo
await updateNoteInIndex(targetDir, newFilePath, fs.readFileSync(novoAbsoluto, 'utf8'));
```

Vale considerar também uma limpeza de órfãos no `loadVectorStore` ou no `reindex`: descartar
chunks cujo `filePath` não existe mais em disco.

---

## 4. R4 — BAIXO: `compact: true` imprime `Trecho: undefined`

Toda consulta com `compact: true` traz, para cada resultado:

```
**Trecho:**
undefined
```

Com `compact: false` o trecho real aparece normalmente. O handler omite o campo `excerpt` no modo
compacto (correto), mas o formatador em `mcp-server.js` emite o bloco `**Trecho:**` sem verificar
se ele existe. Não quebra nada, mas gasta tokens à toa exatamente no modo criado para economizar
tokens, e passa a impressão de erro para quem lê a saída.

**Correção:** só emitir o bloco quando `excerpt` estiver presente.

Isso não apareceu nas rodadas anteriores porque eu testei o `compact` pelo módulo direto
(comparando o JSON), e não pela renderização em texto do servidor MCP.

---

## 5. Observação menor: resumo por pasta em toda página

Com `limit: 3` a resposta do `get_pending_reviews` traz as 22 pastas do resumo — cerca de 1,2k
chars de cabeçalho para 3 linhas de lista. Sugestão: mostrar o resumo só quando `offset === 0`,
ou atrás de um parâmetro.

---

## 6. Checklist consolidado

| | Item | Status |
|---|---|---|
| ☑ | **B1**, **B2**, **B2b**, **B3**, **B3b**, **B4**, **B7**, **B8** | ✅ |
| ☑ | **B5** — `read_note` frontmatter | ✅ |
| ☑ | **B6** — ação `delete` | ✅ |
| ☑ | **N1–N4**, **N6** | ✅ |
| ☑ | **R1** — cross-lingual | ✅ |
| ☑ | **R2** — guarda de índice legado | ✅ |
| ☑ | **R3** — `pathPrefix` | ✅ |
| ☐ | **R5** — `move_note` não reindexa | ❌ **Alto** |
| ☐ | **R4** — `Trecho: undefined` no compact | ⚠️ Baixo |
| ☐ | **N5** — escala de `minScore` | ⚠️ Baixo (documentado) |
| ☐ | Resumo por pasta em toda página | ⚠️ Cosmético |

---

## 7. Limpeza executada

| Item | Ação |
|---|---|
| `_tmp-qa/nota-valida-125.md` → `nota-movida-125.md` | criada, movida e deletada |
| `_tmp-qa/r5-origem.md` → `r5-destino.md` | criada, movida e deletada |
| `_tmp-qa/` (diretório) | removido |
| Diretriz `qa-temp-125` e perfil `qa-temp-125` | removidos pela ação `delete` do MCP |
| 2 chunks órfãos de `_tmp-qa` no índice | removidos (2.814 → 2.812) |
| Memória de sessão | restaurada ao conteúdo original |

**Estado final:** 3 diretrizes · 2 perfis · 6 skills · 2.812 chunks — idêntico ao inicial.
