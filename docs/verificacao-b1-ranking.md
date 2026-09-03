# Verificação da Correção — B1 (Ranking RRF / BM25)

| | |
|---|---|
| **Rodada** | 2ª (reavaliação) |
| **Data** | 2026-09-03 |
| **Arquivos alterados** | `lib/tools/query.js`, `lib/rag/vectorStore.js`, `lib/schemas.js` (+172/−56 vs. `277d77d`) |
| **Estado** | Não commitado, apenas local |
| **Método** | 10 consultas com resposta correta conhecida + testes de filtro, `compact`, `limit`/`minScore`, termos com `_` e acento + diagnóstico isolado de regex e tokenizador |

> ⚠️ O servidor MCP em execução (PID 394793, de `02/09 12:49`) **continua sem** estas correções —
> `require` do Node é cacheado. Todos os testes abaixo invocam o módulo corrigido diretamente.
> Reinicie o cliente MCP antes de validar pela ferramenta.

---

## Veredito da 2ª rodada

### ✅ B1 corrigido e estável. N1, N2, N3, N4 e N6 resolvidos.

**8 de 10 consultas em 1º lugar · 9 de 10 no top-3** (1ª rodada: 5/6 em 1º; original: 0/4).

| Item | 1ª rodada | 2ª rodada |
|---|---|---|
| **B1** — ranking RRF/BM25 | ✅ Corrigido | ✅ Mantido, mais estável |
| **N1** — `tags`/`topic` zeravam resultados | ❌ Bloqueador | ✅ **Corrigido** |
| **N2** — tokenizador removia `_` | ❌ Bloqueador | ✅ **Corrigido** |
| **N3** — acento inicial não casava | ❌ Alto | ✅ **Corrigido** |
| **N4** — `compact` reduzia só 38% | ⚠️ Médio | ✅ **Corrigido (62,9%)** |
| **N6** — janela vetorial / `K=60` | ⚠️ Teto | ✅ Melhorado (150 chunks, `K=20`) |
| **N5** — escala de `minScore` | ⚠️ Médio | ⚠️ **Ainda aberto** (rebaixado a baixo) |
| **R1** — lacuna cross-lingual PT→EN | — | ⚠️ **Novo** (limitação de modelo, não de código) |

**Correção do meu relatório anterior:** eu havia reportado N2 e N3 como bloqueadores com base em
`keywordScore = 0`. Aquela medição estava errada — eu lia o `keywordScore` apenas entre os 5
primeiros resultados, e a metade vetorial dominava o top-5. Com `limit: 20` e verificação direta
da regex, os termos casam corretamente. Registro isso porque muda a ação: **N2 e N3 não precisam
de mais nenhuma alteração.**

---

## 1. Benchmark de ranking

| # | Consulta | Nota esperada | Posição |
|---|---|---|---|
| 1 | "Como funciona validação de schema com Yup em formulários React?" | `_shared/yup/...validation-patterns` | **1º** ✅ |
| 2 | "padrões de validação Yup condicional when e transform" | `_shared/yup/...validation-patterns` | 8º ❌ (ver R1) |
| 3 | "Como funciona o event loop do Node.js" | `_shared/nodejs/...event-loop` | **1º** ✅ |
| 4 | "React Query cache e data fetching" | `_shared/react-query/...data-fetching` | **1º** ✅ |
| 5 | "Next.js App Router estrutura de rotas" | `_shared/nextjs/...app-router` | **1º** ✅ |
| 6 | "React Server Components e Client Components" | `_shared/react/...server-client-components` | **1º** ✅ |
| 7 | "React hooks useEffect e useMemo" | `_shared/react/...hooks` | **1º** ✅ |
| 8 | "integração do yupResolver com React Hook Form" | `_shared/react-hook-form/...validation-patterns` | 2º ⚠️ |
| 9 | "migrations e Lucid ORM no AdonisJS 4" | `_shared/adonisjs4/...lucid-orm-migrations` | **1º** ✅ |
| 10 | "estratégias de renderização SSR ISR no Next.js" | `_shared/nextjs/...rendering-strategies` | **1º** ✅ |

O caso 8 é aceitável: em 1º veio `proj-solucz/nextjs12/...frontend-patterns` (sem 0.601,
kw 0.891), que também documenta `yupResolver` — resposta legítima, não erro de ranking.

**Latência:** 228–494ms por consulta (a 1ª inclui carga do modelo ONNX).

---

## 2. N1 — corrigido na estrutura certa ✅

A correção foi feita onde devia: `searchVectorStore` passou a aceitar `allowedPathsSet` e
**filtra os chunks antes de pontuar**, em vez de pós-filtrar o resultado global.

```js
// lib/rag/vectorStore.js
async function searchVectorStore(targetDir, queryText, topK = 10, allowedPathsSet = null) {
  let chunksToSearch = store.chunks;
  if (allowedPathsSet && allowedPathsSet instanceof Set && allowedPathsSet.size > 0) {
    chunksToSearch = chunksToSearch.filter(c => allowedPathsSet.has(normalizeRelPath(c.filePath)));
  }
```

Com isso o filtro define o universo de busca e não compete mais com a janela de recall. Há ainda
um fallback em `query.js` que injeta as notas filtradas caso a fusão zere os candidatos.

| Teste | 1ª rodada | 2ª rodada |
|---|---|---|
| `tags:["stack/yup"]` + "padrões de validação" | **0 res** | **1 res**, a nota Yup, tag confere ✅ |
| `topic:"Yup — Schema Validation Patterns"` + query "event loop" | **0 res** | **1 res**, tópico confere ✅ |
| `tags:["stack/nodejs"]` + "hooks" | — | **5 res, todas com a tag** ✅ |
| `tags:["stack/yup"]` + query sem nenhum match (fallback) | — | **1 res** (sem=0.341, kw=0) ✅ |
| `tags:["tag-que-nao-existe-zzz"]` | — | **0 res** ✅ (correto) |

---

## 3. N2 e N3 — corrigidos ✅

```js
// N2: underscore preservado no tokenizador
.map(w => w.replace(/[^a-z0-9_\-À-ÿ]/gi, '').trim())

// N3: lookbehind/lookahead com a faixa acentuada, no lugar de \b (ASCII-only)
new RegExp(`(?<=^|[^a-zA-Z0-9_\\u00C0-\\u00FF])${escaped}(?=$|[^a-zA-Z0-9_\\u00C0-\\u00FF])`, 'gi')
```

Verificação direta contra as 595 notas do vault — quantas notas contêm o termo por `substring`
vs. quantas casam pela regex nova:

| Termo | substring | regex | |
|---|---|---|---|
| `tos_pi` | 4 | **4** | ✅ paridade |
| `token_density` | 592 | **592** | ✅ paridade |
| `verified_by_reviewer` | 592 | **592** | ✅ paridade |
| `índice` | 5 | **5** | ✅ paridade (acento inicial resolvido) |
| `precificação` | 15 | **15** | ✅ paridade |
| `órfão` | 3 | 1 | ✅ correto — as 2 restantes são `órfãos` (plural) |
| `única` | 11 | 10 | ✅ correto — a restante é `únicas` (plural) |

E o BM25 pontuando de fato (`limit: 20`):

```
"tos_pi"               -> 4 notas com keywordScore>0 (máx 0.219)
"token_density"        -> 9 notas com keywordScore>0 (máx 0.27)
"verified_by_reviewer" -> 11 notas com keywordScore>0 (máx 0.27)
```

**Limitação conhecida (não é bug):** não há stemming — `órfão` não casa `órfãos`, `única` não casa
`únicas`. É o comportamento esperado de casamento por termo exato; a metade semântica cobre esses
casos. Só vale registrar na documentação.

---

## 4. N4 — corrigido ✅

O modo compacto agora enxuga o frontmatter para `topic` + `tags`:

```
full = 3215 chars | compact = 1192 chars | redução = 62,9%
frontmatter compact = {"topic":"Yup — Schema Validation Patterns","tags":[...3 tags]}
```

62,9% está coerente com o "até 70%" anunciado no schema. ✅

---

## 5. N5 — único item ainda aberto (severidade baixa)

`K = 20` deu poder discriminativo aos scores, o que era metade do problema:

| | 1ª rodada (`K=60`) | 2ª rodada (`K=20`) |
|---|---|---|
| Top-5 scores | `0.016, 0.016, 0.015, 0.015, 0.015` | `0.048, 0.036, 0.034, 0.031, 0.030` ✅ |

Mas a **escala** continua opaca. O teto matemático é `1/(K+1) = 1/21 ≈ 0.0476`:

```
maior rrfScore observado = 0.048   (no teto)
minScore: 0.5  -> 0 resultados
minScore: 0.05 -> 0 resultados
minScore: 0.01 -> 5 resultados
```

Qualquer valor que um usuário leia como "relevância mínima" (`0.3`, `0.5`, `0.8`) devolve zero.
O schema sugere `ex: 0.01`, que funciona por coincidência de escala.

**Sugestão (baixo esforço):** normalizar antes de expor — `score = rrfScore * (K + 1)`, o que
coloca tudo em 0–1 — ou trocar a descrição do schema para
`"Corte de relevância RRF. Faixa útil: 0 a 0.047 (teto = 1/(K+1))"`. Não é bloqueador: o padrão
`0` funciona e o `limit` já resolve o caso comum.

---

## 6. R1 — novo achado: lacuna cross-lingual PT→EN

É a causa do único erro real do benchmark (caso 2), e **não é bug de código**.

Mesma pergunta, dois idiomas:

| Idioma | Consulta | Posição da nota Yup | semanticScore | keywordScore |
|---|---|---|---|---|
| **PT** | "padrões de validação Yup condicional when e transform" | **8º** | **0** (fora da janela) | 0.715 |
| **EN** | "Yup conditional validation when and transform patterns" | **1º** | 0.648 | 1.302 |

O modelo configurado é `Xenova/all-MiniLM-L6-v2` (`lib/rag/embeddings.js:7`), treinado em inglês.
As notas `_shared/*` têm o corpo em inglês; consultas em português não alcançam esses chunks.

O agravante estrutural: no caso PT a nota Yup tinha o **maior keywordScore de todo o conjunto**
(0.715) e ainda assim ficou em 8º, porque `semanticScore` foi 0. Com `K=20` e pesos 0.6/0.4:

| Situação | rrfScore |
|---|---|
| Nota **1ª no vetorial**, ausente do keyword | `0.6/21 =` **0.0286** |
| Nota **7ª no vetorial**, ausente do keyword | `0.6/27 =` **0.0222** |
| Nota **1ª no keyword**, ausente do vetorial | `0.4/21 =` **0.0190** |

Ou seja, uma nota em 1º no keyword ainda perde de qualquer nota nas **8 primeiras posições do
vetorial**. Quando a metade semântica falha por idioma, o keyword não tem peso para compensar.

**Duas alternativas:**

1. **Trocar o modelo** (resolve a raiz). Já existe a variável `EMBEDDING_MODEL` em
   `lib/rag/embeddings.js:7`, então é configuração + `reindex_vault`:
   ```bash
   EMBEDDING_MODEL=Xenova/paraphrase-multilingual-MiniLM-L12-v2
   ```
   Custo: download maior (~470MB vs ~90MB) e reindexação completa dos 2.815 chunks.
2. **Piso para acerto forte de keyword** (mitigação, ~3 linhas). Se uma nota é 1ª ou 2ª no
   keyword e está ausente do vetorial, garanti-la no conjunto final — ou elevar o peso do
   keyword para 0.5/0.5 quando `semanticScore === 0`.

Se o vault vai continuar bilíngue (notas `_shared` em inglês, consultas em português), a
**opção 1 é a que vale**. A opção 2 é um paliativo útil de qualquer forma.

---

## 7. Checklist para publicar

| | Item | Status |
|---|---|---|
| ☑ | **B1** — ranking RRF/BM25 | ✅ 8/10 em 1º, 9/10 no top-3 |
| ☑ | **B4** — métrica de tokens conta o payload | ✅ Corrigido |
| ☑ | **B7** — `compact` / `tags` / `topic` / `limit` | ✅ Corrigido |
| ☑ | **N1** — filtro zerava resultados | ✅ Corrigido em `vectorStore.js` |
| ☑ | **N2** — tokenizador removia `_` | ✅ Corrigido |
| ☑ | **N3** — acento inicial | ✅ Corrigido |
| ☑ | **N4** — `compact` 62,9% | ✅ Corrigido |
| ☑ | **N6** — janela 150 chunks, `K=20` | ✅ Corrigido |
| ☐ | **N5** — escala de `minScore` | ⚠️ Baixo (cosmético/doc) |
| ☐ | **R1** — cross-lingual PT→EN | ⚠️ Decisão de modelo |
| ☐ | **B2** — `get_pending_reviews` sem paginação | Pendente |
| ☐ | **B3** — gate do `validate_vault` | Pendente |
| ☐ | **B5** — `read_note` duplica frontmatter | Pendente |
| ☐ | **B6** — sem `delete` em guidelines/profiles | Pendente |
| ☐ | **B8** — wiki-links de skills não validados | Pendente |

**A frente de busca (B1/B7/N1–N6) está pronta para publicar.** N5 é cosmético e R1 é uma decisão
sua sobre o modelo de embeddings. Os cinco itens `B2`, `B3`, `B5`, `B6` e `B8` seguem intocados —
estão em outras ferramentas, não em `query.js`.

### Observação de desempenho (não bloqueia)

`getAllNotes()` faz `readFileSync` dos **595 arquivos em cada consulta**, e é hoje o custo
dominante dos ~230ms. Um cache invalidado por `mtime` levaria a latência de volta à casa dos 10ms.

---

## Reprodução

Em `/tmp/claude-1000/-home-jean-Projects-Rimatur/6a84597d-1133-43a7-8ff9-137a3f4c0196/scratchpad/`:
`bench2.js` (benchmark de 10 casos + filtros + fallback + compact + limit/minScore),
`diag2.js` (paridade substring↔regex nas 595 notas, tokenizador, BM25 real),
`diag3.js` (teste cross-lingual PT vs EN).
Executar com `cd /home/jean/Projects/local_rag_obisidian_project && node <script>`.
