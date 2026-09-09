# Bateria Completa — v1.2.6 pelas ferramentas MCP reais

| | |
|---|---|
| **Versão** | 1.2.6 (publicada no npm; sessão reiniciada) |
| **Commit** | `4f4999a` — *R5 vector index on move/delete + orphan pruning, R4 compact formatting, get_pending_reviews pagination optimization* |
| **Data** | 2026-09-03 |
| **Método** | Chamadas às **14 ferramentas MCP** pelo cliente real, vault e índice reais |
| **Índice** | 595 arquivos · 2.812 chunks · `model: Xenova/multilingual-e5-small` |

---

## Veredito

**14 de 14 ferramentas funcionais. Nenhum bug encontrado nesta rodada.**

Os dois achados da rodada anterior estão corrigidos e confirmados pelo caminho real do cliente —
que é onde ambos apareceram.

| Item | Status |
|---|---|
| **R4** — `compact` imprimia `Trecho: undefined` | ✅ **Corrigido** |
| **R5** — `move_note` não atualizava o índice | ✅ **Corrigido** |
| **R5b** — órfãos persistiam após move+delete | ✅ **Corrigido** (poda de órfãos) |
| Paginação repetia o resumo por pasta | ✅ **Otimizada** |
| **B5**, **B6**, **B3b**, **R3**, **R2**, **B1/R1** | ✅ Confirmados |
| **N5** — escala absoluta de `minScore` | ⚠️ Único item aberto (documentado) |

---

## 1. R5 — ciclo completo pelo MCP ✅

```
1. write_note _tmp-qa3/r5c-origem.md  (termo único "jabuticaba5533")
2. query "jabuticaba5533"  -> 1º lugar em r5c-origem, semantic 0.853       ✅
3. move_note r5c-origem -> r5c-destino
4. query "jabuticaba5533"  -> 1º lugar em r5c-destino, semantic 0.860      ✅ (antes: NÃO encontrada)
5. índice: chunks em r5c-origem = 0  |  chunks em r5c-destino = 2          ✅ (antes: 2 | 0)
6. delete_note r5c-destino
7. órfãos de _tmp-qa3 no índice = 0                                        ✅ (antes: 2 persistiam)
```

E a poda global confirma que não há resíduo acumulado no vault:

```
total de chunks: 2812
chunks apontando para arquivo inexistente: 0
```

## 2. R4 — `compact` limpo ✅

```
### Nota: _shared/nodejs/shared-nodejs-event-loop.md (Score RRF: 0.048)
- **Tópico:** Event Loop
- **Tags:** _shared/nodejs/event-loop, stack/nodejs
- **Semantic Score:** 0.914 | **Keyword Score:** 0.91
```

O bloco `**Trecho:**` deixou de ser emitido no modo compacto — não há mais `undefined` na saída.
Com `compact: false` o trecho real continua vindo normalmente.

## 3. Paginação otimizada ✅

`get_pending_reviews` com `limit: 3, offset: 2`:

| | Antes (1.2.5) | **Agora (1.2.6)** |
|---|---|---|
| Payload | ~2.400 chars | **699 chars** |
| Pastas repetidas no resumo | 22 | **0** (resumo só em `offset 0`) |

---

## 4. Resultado das 14 ferramentas

| # | Ferramenta | Resultado |
|---|---|---|
| 1 | `get_mcp_metrics` | ✅ 590 consultas · P50 **28ms** · P95 474ms |
| 2 | `validate_vault` | ✅ **~1.100 chars** · `0 errors, 642 warnings` · PASSED · categorias normalizadas |
| 3 | `get_pending_reviews` | ✅ 699 chars com `offset`; totais corretos (565) |
| 4 | `query_knowledge_base` | ✅ `compact`, `tags`, `topic`, `limit` — todos corretos |
| 5 | `read_note` | ✅ `startLine/endLine` traz frontmatter **1x** + conteúdo real (B5) |
| 6 | `write_note` | ✅ criou nota; rejeitou `[[nota-que-nao-existe-126]]` |
| 7 | `move_note` | ✅ **migra o índice** (R5) |
| 8 | `delete_note` | ✅ remove arquivo, chunks e órfãos |
| 9 | `reindex_vault` | ✅ 595 arquivos / 2.812 chunks |
| 10 | `list_skills` | ✅ 6 skills |
| 11 | `read_skill` | ✅ manual completo (`react-query`) |
| 12 | `manage_guidelines` | ✅ `list`/`read`/`write`/`delete` |
| 13 | `manage_agent_profile` | ✅ `list`/`read`/`write`/`delete` |
| 14 | `manage_session_memory` | ✅ `get`/`save` (merge)/`clear` + restauração |

### Filtros estritos

| Consulta | Resultado |
|---|---|
| `tags: ["stack/yup"]` + "padrões de validação de schema" | 1 nota, a correta (semantic 0.893) |
| `topic: "Yup — Schema Validation Patterns"` + query "event loop" | 1 nota, só a do tópico (semantic 0.766) |

## 5. Benchmark de recuperação — estável

| Métrica | v1.2.5 | **v1.2.6** |
|---|---|---|
| Grupo A — R@1 (PT → nota EN) | 15/16 (94%) | **15/16 (94%)** |
| Grupo B — R@1 (PT → nota PT) | 10/10 (100%) | **10/10 (100%)** |
| **TOTAL — R@1** | 25/26 (96%) | **25/26 (96%)** |
| **TOTAL — R@3** | 26/26 | **26/26** |
| **TOTAL — MRR** | 0.981 | **0.981** |

O único caso que não fica em 1º (`"padrões de assincronismo e emissor de eventos no Node"` → 2º,
atrás de um `_project.md`) é ambiguidade de conteúdo, não falha de ranking: a nota esperada está em
2º e o R@3 é 100%.

---

## 6. Trajetória consolidada

| Métrica | v1.2.0 (original) | **v1.2.6** |
|---|---|---|
| Acerto em 1º lugar (26 consultas) | 18/26 (69%)¹ | **25/26 (96%)** |
| R@3 | 22/26 | **26/26 (100%)** |
| `get_pending_reviews` (payload) | 117.651 chars → recusado | **3.785 chars** (−96,8%) |
| `validate_vault` (payload) | 117.651 chars / 22.407 tokens² | **~1.100 chars** (−99,1%) |
| Bugs de impacto abertos | 8 | **0** |

¹ Já com o modelo multilíngue; com o `all-MiniLM` original o ranking colocava a resposta correta
em último lugar (keyword score 267 vs 65).
² 89.628 chars na v1.2.2, após a remoção do dump de DEBUG.

**Itens abertos:** apenas **N5** — o `minScore` opera numa escala absoluta cujo teto é `1/(K+1) ≈ 0.048`,
então valores intuitivos como `0.5` devolvem zero. Já está documentado no schema; normalizar para
0–1 seria acabamento.

---

## 7. Limpeza executada

| Item | Ação |
|---|---|
| `_tmp-qa3/r5c-origem.md` → `r5c-destino.md` | criada, movida e deletada |
| `_tmp-qa3/` (diretório) | removido |
| Diretriz `qa-temp-126` · perfil `qa-temp-126` | removidos pela ação `delete` do MCP |
| Memória de sessão | limpa no teste e **restaurada** ao conteúdo original |
| Índice | 2.812 chunks, 0 órfãos |

**Estado final:** 3 diretrizes · 2 perfis · 6 skills · 2.812 chunks — idêntico ao inicial.
