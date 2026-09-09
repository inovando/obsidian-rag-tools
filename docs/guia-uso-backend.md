# Guia de Uso do MCP no Desenvolvimento Backend

Baseado nas medições desta bateria (v1.2.6, 26 consultas, vault de 595 notas). Todas as
recomendações abaixo têm número atrás.

---

## 1. O laço diário

O erro comum é usar o MCP só como "busca". Ele rende mais como **memória de trabalho** com quatro
momentos distintos no ciclo de uma tarefa.

### Início da tarefa — recuperar contexto (3 chamadas, ~1.500 tokens)

```
manage_session_memory  action=get                    -> onde a tarefa parou, decisões já tomadas
manage_guidelines      action=read type=language name=typescript
query_knowledge_base   query="<a tarefa>" tags=["stack/adonisjs4"] compact=true
```

O `compact=true` aqui é deliberado: nesta fase você quer **triagem** (quais notas existem), não
conteúdo. Custa ~250 tokens contra ~900 do modo completo.

### Antes de escrever código — carregar o padrão

```
read_skill             skillId=<tecnologia>          -> checklist e pitfalls
read_note              filePath=<nota> heading="<seção>"   -> só o trecho que importa
```

`read_note` com `heading` é o maior ganho de token do ciclo: a nota de Yup tem 3.228 caracteres,
a seção `Stack Coverage` tem 120.

### Durante — consultar sob filtro

Sempre com `tags`. É pré-filtro estrito desde a 1.2.5: a consulta `"padrões de validação de
schema"` com `tags=["stack/yup"]` devolveu **1 resultado, o correto** (semantic 0,893). Sem o
filtro, a mesma pergunta traz 5 candidatos de projetos diferentes.

### Fim da tarefa — devolver conhecimento

```
write_note             -> a decisão que você tomou e o porquê
manage_session_memory  action=save context=... decisions=[...] nextSteps=[...]
```

Esta é a etapa que quase todo mundo pula, e é a que faz o vault valer algo em três meses. O
`write_note` tem gate real: rejeita wiki-link órfão e nota acima de 200 linhas — 59 erros de
validação evitados até agora segundo o `get_mcp_metrics`.

### Semanalmente — curar

```
get_pending_reviews    limit=20 pathPrefix="proj-rimatur/"
validate_vault
```

565 notas estão com `verified_by_reviewer: false`. Só um humano deve virar essa flag — é o que
separa "a IA escreveu" de "eu confirmei".

---

## 2. Técnicas para melhorar a assertividade

Ordenadas pelo impacto que **medi**, não por preferência.

### 2.1 Isolar o `imported/` — maior ganho disponível

| | |
|---|---|
| Notas em `imported/` | **483 de 519 (93% do vault)** |
| Notas de `imported/` com alguma tag além de `imported` | **0** |

Nos meus testes, notas de `imported/` venceram indevidamente 4 consultas:
`rag-parte-4.md` ganhou de `shared-react-hooks.md`, `cache-parte-12.md` ganhou de
`shared-nextjs-data-fetching-caching.md`, `skill-parte-3.md` e `usage-parte-10.md` idem. São
documentos importados de terceiros, fatiados em `-parte-N`, sem curadoria — e ocupam 93% do
espaço vetorial.

Três saídas, da mais barata para a melhor:

1. **Filtrar na consulta.** Hoje não há como excluir caminho no `query_knowledge_base` (ver
   proposta 3.2). Enquanto não houver, use `tags` sempre — como `imported/` não tem tags, qualquer
   filtro por tag já o elimina inteiro.
2. **Mover para fora de `references/`.** Se é material de leitura e não referência de trabalho,
   ele não deveria disputar o ranking. Um `archive/` fora do vault indexado resolve.
3. **Taguear o que presta e descartar o resto.** Dos 483, provavelmente 30 ou 40 merecem virar
   nota curada de verdade.

### 2.2 Escrever `topic` e cabeçalhos em português

O `chunker.js:84` embeda um cabeçalho em cada chunk:

```js
`Tópico: ${topic}\nTags: ${tags}\nSeção: ${sec.heading}\nCaminho: ${filePath}\n\n${conteúdo}`
```

Ou seja, `topic` e `heading` **entram no vetor**. Como você pergunta em português, escrevê-los em
português adiciona sinal de graça. Convenção que recomendo:

| Elemento | Idioma |
|---|---|
| `topic`, cabeçalhos, prosa | **Português** |
| Identificadores, campos, nomes de API (`tos_pi`, `yupResolver`) | **Inglês/original** |
| `tags` | inglês curto (`stack/adonisjs4`) |
| Blocos de código | como no código real |

Isso explora as duas metades do híbrido: semântica em PT pela prosa, BM25 exato em EN pelos
identificadores — que passaram a casar corretamente depois da correção do underscore.

### 2.3 Nomear cabeçalhos como a pergunta que respondem

Cada seção é um chunk independente. `## Crédito Retroativo de Veículo` recupera melhor que
`## Detalhes 3`. Se você escreve o cabeçalho com as palavras que usaria na pergunta, o chunk casa.

### 2.4 Uma nota, um conceito, ≤200 linhas

O limite não é burocracia: nota curta = chunk específico = score alto. As notas que acertaram 1º
lugar nos testes têm 14 a 142 linhas. As 22 notas que estouram 200 linhas são justamente as que
aparecem com score difuso.

### 2.5 Estender a taxonomia de tags

Você já tem `stack/*` (100 usos) e `pattern/*` (55). Faltam dois eixos que um backend consulta
todo dia:

```yaml
tags:
  - stack/adonisjs4        # já existe
  - pattern/repository     # já existe
  - layer/controller       # PROPOSTO: controller | usecase | repository | model | migration | job
  - domain/faturamento     # PROPOSTO: o domínio de negócio
  - proj-rimatur
```

Com `layer/*` você passa a perguntar "como faço um repository aqui" com `tags=["layer/repository",
"stack/adonisjs4"]` e recebe exatamente as notas daquela camada naquele stack.

### 2.6 Usar `_project.md` como porta de entrada

`proj-rimatur/_project.md` já tem o glossário de 102 tabelas e o mapa de componentes. Para uma
tarefa nova em projeto que você não toca há meses, ler esse arquivo primeiro custa ~1.200 tokens
e evita 5 consultas erradas.

### 2.7 O que **não** ajuda

- **`minScore`**: a escala é absoluta com teto `1/(K+1) ≈ 0,048`. `0,5` devolve zero. Use `limit`.
- **Consulta de uma palavra**: `"validação"` casa 100+ notas. Pergunte a frase inteira — o
  embedding trabalha melhor com contexto, e o BM25 já descarta stopwords.

---

## 3. Recursos que faltam (propostas, por valor)

### 3.1 Cache do índice em memória — o maior ganho de todos

| Etapa de uma consulta | Tempo |
|---|---|
| `readFileSync` do índice (33,2 MB) | 390ms |
| `JSON.parse` | 151ms |
| **Embedding da consulta** | **18ms** |
| BM25 + RRF | ~1ms |

**96% do tempo é reler o índice do disco a cada chamada.** Cachear o objeto parseado, invalidando
por `mtime` do `rag-index.json`, levaria a consulta de ~560ms para ~20ms. É uma mudança pequena e
transforma o MCP de "aceitável" em instantâneo.

### 3.2 `pathPrefix` / `excludePaths` no `query_knowledge_base`

O `get_pending_reviews` já tem `pathPrefix`. A consulta não. Com
`excludePaths: ["imported/"]` o problema da seção 2.1 morre sem retagear 483 notas. É o filtro
mais útil que falta.

### 3.3 `verifiedOnly: true`

Existe `verified_by_reviewer` no frontmatter e um relatório de pendências, mas **não há como
buscar apenas o que foi humanamente aprovado**. Para decisões de arquitetura você quer só o
conteúdo curado. Fecha o ciclo que o `get_pending_reviews` abriu.

### 3.4 Devolver `startLine`/`endLine` no resultado da consulta

Hoje a consulta devolve o excerpt e o caminho; para ler mais você chama `read_note` e adivinha a
seção. Se o resultado trouxesse as linhas do chunk, o `read_note` viraria uma leitura cirúrgica —
economia direta de tokens no passo mais caro do ciclo.

### 3.5 Backlinks / notas relacionadas

Os wiki-links já são validados na escrita, mas não são consultáveis. Um `get_related_notes` que
seguisse `[[links]]` e tags em comum permitiria "me mostre tudo que se conecta a esta decisão" —
que é como um dev navega documentação de verdade.

### 3.6 Ingestão a partir do código e do banco

Você tem MCP de PostgreSQL e 102 tabelas no Rimatur. Um comando que gerasse notas a partir do
schema real (tabelas, FKs, índices) manteria o glossário do `_project.md` sincronizado sem
trabalho manual — hoje ele é mantido à mão e envelhece. Vale o mesmo para OpenAPI/rotas.

### 3.7 ADRs de primeira classe

`imported/` está cheio de exemplos de ADR. Um `write_adr` com template e campo `status`
(proposto / aceito / substituído por) daria rastro das decisões — que é exatamente o que o
`write_note` já faz, mas sem a semântica de ciclo de vida.

### 3.8 Hook de pré-commit

Agora que o `validate_vault` retorna exit code correto (0 com warnings, ≠0 só com erros), dá para
plugar:

```bash
# .git/hooks/pre-commit
npx obsidian-rag-validate || exit 1
```

Antes da correção do B3 isso era impossível: qualquer nota não revisada reprovava o commit.

---

## 4. Resumo em uma tela

**Faça agora:**
1. Tire o `imported/` do caminho (mover ou sempre filtrar por tag).
2. Passe `tags` em toda consulta.
3. `compact=true` para triagem, `read_note` + `heading` para detalhe.
4. `write_note` + `manage_session_memory` ao fim de cada tarefa.

**Peça ao pacote (por valor):**
1. Cache do índice em memória (560ms → 20ms).
2. `excludePaths` na consulta.
3. `verifiedOnly` na consulta.
4. `startLine`/`endLine` no resultado.

**Convenção de escrita:** prosa e `topic` em português, identificadores em inglês, um conceito por
nota, cabeçalho com as palavras da pergunta.
