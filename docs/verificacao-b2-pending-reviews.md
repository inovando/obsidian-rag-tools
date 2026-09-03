# Verificação da Correção — B2 (`get_pending_reviews`) + troca do modelo

| | |
|---|---|
| **Commit** | `b70a368` — *B2 paginated pending reviews and Xenova/multilingual-e5-small embeddings upgrade* |
| **Data** | 2026-09-03 |
| **Método** | Chamadas **JSON-RPC reais** via stdio contra `mcp-server.js --official` (o caminho que o cliente MCP usa), + benchmark de 26 consultas na configuração real |
| **Índice** | Real, reindexado às 11:24 com `model: "Xenova/multilingual-e5-small"` (2.812 chunks) |

---

## Veredito

### ✅ B2 corrigido. Redução de 96,8% no payload.

| | Antes | Depois |
|---|---|---|
| Chamada padrão (sem argumentos) | **117.651 chars / 567 linhas** → recusado pelo cliente | **3.785 chars / 51 linhas** (~946 tokens) |

### ✅ A troca do modelo se confirma na configuração real: 25/26 (96%)

### ❌ 1 bloqueador novo no caminho de atualização (`R2`) — a guarda de modelo não cobre índices legados

---

## 1. B2 — `get_pending_reviews` via JSON-RPC

| Chamada | Chars | Linhas | ~Tokens | Notas |
|---|---|---|---|---|
| padrão (sem argumentos) | **3.785** | 51 | 946 | 20 |
| `limit: 5` | 1.774 | 36 | 444 | 5 |
| `limit: 5, offset: 5` | 1.717 | 36 | 429 | 5 |
| `limit: 99` (cap) | 8.176 | 81 | 2.044 | **50** ✅ cap respeitado |
| `pathPrefix: "_shared/"` | 941 | 13 | 235 | 5 |
| `pathPrefix: "imported/", limit: 3` | 769 | 13 | 192 | 3 |
| `pathPrefix` inexistente | 103 | 1 | 26 | 0 |

Tudo o que foi pedido funciona: `limit` com padrão 20 e teto de 50, `offset` paginando
corretamente (`Exibindo: 6 a 10`), `pathPrefix` filtrando, resumo agregado por pasta e dica de
navegação. A saída também passou a excluir `.obsidian` da varredura, o que resolve de lambuja o
bug de caminho `.obsidian/.obsidian/.obsidian/` que eu havia reportado no B3.

Formato retornado (`limit: 2, pathPrefix: "_shared/"`):

```
📌 **Relatório de Notas Pendentes de Revisão Humana:**
- **Total de Pendências no Vault:** 5
- **Exibindo:** 1 a 2 (Offset: 0 | Limite: 2)

📊 **Resumo de Pendências por Pasta:**
- `_shared/`: 5 notas pendentes

📋 **Lista Paginada de Pendências:**
- **_shared/_index.md** | Tópico: Shared References Index | Modificado: 2026-06-18T15:30:00Z
- **_shared/chakra-ui/shared-chakra-ui-component-patterns.md** | Tópico: Chakra UI — ...

💡 *Existem mais notas pendentes. Use limit=2 e offset=2 para avançar.*
```

### Dois ajustes menores de texto (não bloqueiam)

**a) Mensagem enganosa quando o filtro não casa nada.** Com `pathPrefix` inexistente a resposta é:

```
✅ Nenhuma nota pendente de revisão humana! Todas as notas estão aprovadas (verified_by_reviewer: true).
```

Só que existem **565 notas pendentes** no vault — o filtro é que não casou. Um agente lendo isso
reportaria ao usuário que o vault está todo revisado. Deveria distinguir os dois casos:
*"Nenhuma pendência para o filtro `X` (o vault tem 565 pendências no total)."*

**b) Rótulo `Total de Pendências no Vault` mostra o total filtrado.** Com
`pathPrefix: "_shared/"` ele exibe `5`, que é o total **do filtro**, não do vault. O número está
certo para o contexto; o rótulo é que diz "no Vault". Trocar para
`Total de Pendências (no filtro aplicado)` quando houver `pathPrefix`.

---

## 2. Troca do modelo — confirmada na configuração real

Repeti o benchmark de 26 consultas (16 cross-lingual + 10 controle de regressão) contra o **vault
real com o índice real**, sem espelho e sem variável de ambiente:

| Métrica | Antes (`all-MiniLM-L6-v2`) | Agora (`multilingual-e5-small`) |
|---|---|---|
| Grupo A — R@1 (PT → nota EN) | 8/16 (50%) | **15/16 (94%)** |
| Grupo A — MRR | 0.625 | **0.969** |
| Grupo B — R@1 (PT → nota PT) | 10/10 (100%) | **10/10 (100%)** |
| **TOTAL — R@1** | 18/26 (69%) | **25/26 (96%)** |
| **TOTAL — R@3** | 22/26 | **26/26 (100%)** |
| **TOTAL — MRR** | 0.769 | **0.981** |

Os números da medição em espelho se sustentaram na configuração real (MRR até um pouco melhor,
0.981 vs 0.974, porque os prefixos `query:`/`passage:` entraram junto neste commit).

Foram implementadas também as duas recomendações da seção 5 do documento de estratégia:

- **Prefixos e5** — `generateEmbedding(text, kind)` com `kind` `'query'`/`'passage'`, e a detecção
  `isE5` mantendo compatibilidade com outros modelos. ✅
- **Modelo gravado no índice** — `storeData.model = DEFAULT_MODEL` no save, com alerta na carga. ✅
  (mas ver R2 abaixo)

---

## 3. R2 — BLOQUEADOR: a guarda de modelo é cega para índices legados

`lib/rag/vectorStore.js:46`:

```js
if (data.chunks && data.chunks.length > 0 && data.model && data.model !== DEFAULT_MODEL) {
  console.warn(`⚠️ ALERTA: O índice vetorial atual usa o modelo '${data.model}'...`);
}
```

O `data.model &&` faz curto-circuito. Um índice gerado pela **v1.2.0 publicada** não tem esse
campo — logo `data.model` é `undefined`, a condição é falsa e **nenhum alerta é emitido**.

Teste com os dois tipos de índice, ambos com o modelo ativo divergente dos vetores gravados:

| Índice | Campo `model` | Alerta emitido? |
|---|---|---|
| Real (gerado pós-correção) | `"Xenova/multilingual-e5-small"` | ✅ **Sim** — alerta correto |
| Legado (gerado pela v1.2.0) | ausente | ❌ **Não — silêncio total** |

E o custo desse silêncio, medido rodando o benchmark com vetores de um modelo e consultas de outro:

| Métrica | Índice compatível | Índice incompatível (silencioso) |
|---|---|---|
| **TOTAL — R@1** | 25/26 (96%) | **1/26 (4%)** |
| **TOTAL — R@3** | 26/26 | **2/26** |
| **TOTAL — MRR** | 0.981 | **0.058** |
| Grupo B (que era 100%) | 10/10 | **1/10** |

A busca não falha, não avisa e não erra de forma visível — ela simplesmente devolve notas
aleatórias com aparência normal. `"como é calculado o desconto noturno na precificação"` retorna
`usage-parte-10.md` em 1º.

**Este é o caminho de atualização de todo usuário existente da v1.2.0:** instala a nova versão,
o modelo padrão muda de `all-MiniLM-L6-v2` para `multilingual-e5-small`, o índice antigo continua
no disco sem o campo `model`, e a busca passa a operar a 4% de acerto sem um único aviso.

### Correção (1 linha)

Tratar campo ausente como incompatível, já que índice sem `model` só pode ter vindo de uma versão
anterior à troca do modelo padrão:

```js
const indexModel = data.model || null;
if (data.chunks && data.chunks.length > 0 && indexModel !== DEFAULT_MODEL) {
  console.warn(indexModel
    ? `⚠️ ALERTA: índice usa '${indexModel}', modelo ativo é '${DEFAULT_MODEL}'. Reindexe o vault.`
    : `⚠️ ALERTA: índice sem registro de modelo (gerado por versão anterior). O modelo padrão mudou para '${DEFAULT_MODEL}' — reindexe o vault com 'obsidian-rag-index'.`);
}
```

Vale considerar ir além do `console.warn`: em servidor MCP stdio, stderr raramente é lido pelo
usuário. Como o efeito é uma degradação silenciosa de 96% → 4%, o mais seguro é **devolver o aviso
no próprio resultado de `query_knowledge_base`** enquanto o índice estiver incompatível.

---

## 4. Checklist atualizado

| | Item | Status |
|---|---|---|
| ☑ | **B1** — ranking RRF/BM25 | ✅ |
| ☑ | **B2** — `get_pending_reviews` paginado | ✅ **117.651 → 3.785 chars (−96,8%)** |
| ☑ | **B4** — métrica de tokens | ✅ |
| ☑ | **B7** — `compact`/`tags`/`topic`/`limit` | ✅ |
| ☑ | **N1–N4, N6** | ✅ |
| ☑ | **R1** — cross-lingual PT→EN | ✅ **69% → 96% de R@1** |
| ☐ | **R2** — guarda cega para índice legado | ❌ **Bloqueador do upgrade** (1 linha) |
| ☐ | **B2b** — mensagem enganosa em filtro sem match | ⚠️ Baixo (texto) |
| ☐ | **N5** — escala de `minScore` | ⚠️ Baixo |
| ☐ | **B3** — gate do `validate_vault` | Pendente (o bug de path do `.obsidian` já caiu) |
| ☐ | **B5** — `read_note` duplica frontmatter | Pendente |
| ☐ | **B6** — sem `delete` em guidelines/profiles | Pendente |
| ☐ | **B8** — wiki-links de skills não validados | Pendente |

---

## Reprodução

Em `/tmp/claude-1000/-home-jean-Projects-Rimatur/6a84597d-1133-43a7-8ff9-137a3f4c0196/scratchpad/`:
`mcpcall.js` (cliente JSON-RPC stdio que exercita `get_pending_reviews` nas 7 variações),
`bench3.js` (benchmark de 26 consultas) e `vault-legacy/` (vault espelhado com índice sem o campo
`model`, para reproduzir o R2). Executar de dentro de
`/home/jean/Projects/local_rag_obisidian_project`.
