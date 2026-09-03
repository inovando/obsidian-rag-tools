# Verificação — v1.2.2 (R2, B2b, B3, B8)

| | |
|---|---|
| **Versão** | 1.2.2 (`6571005`) |
| **Commits verificados** | `7a42371`, `75ec3f1` (B3 + B8), `6571005` |
| **Data** | 2026-09-03 |
| **Método** | JSON-RPC stdio real contra `mcp-server.js --official`, contagem independente do vault como verdade de campo, benchmark de 26 consultas |

---

## Veredito

| Item | Status |
|---|---|
| **R2** — guarda de modelo cega para índice legado | ✅ **Corrigido** |
| **B2b** — mensagem/rótulo enganosos | ✅ **Corrigido** |
| **B8** — wiki-links de skills não validados | ✅ **Corrigido** |
| **B3** — gate do `validate_vault` | ⚠️ **Parcial** — gate corrigido, payload ainda de 22 mil tokens |
| **Busca (B1/R1)** | ✅ Sem regressão: 25/26 (96%), MRR 0.981 |
| **R3** — `pathPrefix` perde notas (**novo**) | ❌ **Bloqueador** — 1 palavra |

---

## 1. R2 — corrigido ✅

`lib/rag/vectorStore.js` passou a tratar campo ausente como incompatível, exatamente como sugerido.
Os três cenários se comportam corretamente:

| Cenário | Alerta esperado | Resultado |
|---|---|---|
| Índice legado (sem campo `model`) + modelo padrão | sim | ✅ *"índice não possui registro de modelo (gerado por versão anterior)…"* |
| Índice real (`model` = e5) + modelo padrão e5 | **não** (falso positivo) | ✅ silencioso |
| Índice real (`model` = e5) + `EMBEDDING_MODEL` = MiniLM | sim | ✅ *"índice usa 'multilingual-e5-small', mas o modelo ativo é 'all-MiniLM-L6-v2'"* |

O caminho de atualização da v1.2.0 agora avisa. Fica de pé a sugestão anterior de **também**
devolver esse aviso no resultado de `query_knowledge_base` — em servidor MCP stdio o stderr
raramente chega ao usuário, e o efeito silencioso medido era queda de 96% para 4% de acerto.

## 2. B2b — corrigido ✅

| Antes | Depois |
|---|---|
| `pathPrefix` sem match → *"✅ Todas as notas estão aprovadas"* (havendo 565 pendentes) | *"ℹ️ Nenhuma nota pendente para o filtro 'X' (o vault possui N pendências no total)"* |
| `Total de Pendências no Vault: 5` com filtro aplicado | `Total de Pendências no Filtro ('_shared/'): 5 (de N no vault)` |

Rótulo dinâmico e campo `vaultTotalPending` novos. A intenção está certa — mas o valor de
`vaultTotalPending` sai errado por causa do R3.

## 3. B8 — corrigido ✅

`validate_vault.js` agora escaneia `.agents/skills` em busca de wiki-links
(linhas 22-24, 153 e 303: *"B8: Valida wiki-links em .agents/skills/"*), e os links da skill `yup`
foram corrigidos no vault:

```
[[_shared/yup/shared-yup-validation-patterns]]                 -> OK
[[_shared/react-hook-form/shared-react-hook-form-validation-patterns]] -> OK
```

Antes apontavam para `[[_shared/yup/validation-patterns]]`, que não existia.

## 4. B3 — parcial ⚠️

**O que foi corrigido:**

- ✅ O dump `DEBUG: Scanned files: [...]` com os 596 caminhos **saiu**.
- ✅ O gate agora funciona: `0 errors, 642 warnings` → **Exit Code 0 / PASSED**. As pendências de
  revisão humana deixaram de reprovar a validação, então dá para usar em CI e pre-commit.
- ✅ O bug de caminho `.obsidian/.obsidian/.obsidian/` desapareceu.

**O que continua ruim:**

| | Medição |
|---|---|
| Payload da chamada | **89.628 chars / 1.228 linhas / ~22.407 tokens** |

Os 642 warnings são impressos um por um. É o mesmo problema de classe do B2 — falta agregação —
só que aqui custa ~22 mil tokens por chamada, o que na prática inviabiliza usar a ferramenta
dentro de uma conversa.

Além disso há um **erro de rótulo**: como os warnings saem por `console.error`
(`validate_vault.js:466-468`), o wrapper do MCP os apresenta sob o cabeçalho
**"Erros (stderr):"** — logo abaixo de uma linha que diz `0 errors found`. Um agente lendo isso
reporta 642 erros num vault que passou na validação.

**Sugestão:** emitir warnings em `stdout` (não `stderr`), e resumir por padrão —
`- .obsidian/: 483 notas com revisão pendente` — com um parâmetro `verbose: true` ou
`limit`/`pathPrefix` para detalhar, no mesmo espírito do que foi feito no B2.

---

## 5. R3 — BLOQUEADOR NOVO: `pathPrefix` descarta notas silenciosamente

`lib/tools/pending.js:39-41`:

```js
// Filtro opcional por prefixo de caminho
if (pathPrefix && !relPath.toLowerCase().startsWith(pathPrefix)) {
  return;                       // <-- dentro de um for...of
}
```

A função `scan()` usa `for (const entry of fs.readdirSync(...))`, e não um callback. Portanto esse
`return` **não pula o arquivo — encerra o `scan()` daquele diretório inteiro**. Toda nota pendente
que venha *depois* da primeira nota não-correspondente, no mesmo diretório, é perdida.

### Prova

`references/imported/arquitetura/` contém `cache-parte-*.md` (14 pendentes) e `rag-parte-*.md`
(8 pendentes). O `readdirSync` devolve os `cache-*` primeiro.

| Chamada | Verdade de campo | Ferramenta reporta |
|---|---|---|
| `pathPrefix: "imported/arquitetura/rag"` | **8 pendentes** | ❌ **"Nenhuma nota pendente de revisão"** |
| `pathPrefix: "imported/arquitetura/cache"` | 14 pendentes | 14 ✅ (por sorte: vêm primeiro) |

No primeiro caso o `cache-parte-1.md` é a primeira entrada, não casa o filtro, dispara o `return`
e as 8 notas `rag-*` nunca são vistas. **A ferramenta afirma que não há nada pendente onde há 8.**
Para uma ferramenta cujo propósito é rastrear revisão humana, um falso negativo silencioso é o
pior modo de falha possível.

O mesmo `return` também corrompe o `vaultTotalPending` em toda chamada filtrada:

| Chamada | `vaultTotalPending` reportado | Correto |
|---|---|---|
| `pathPrefix: "_shared/"` | 54 | 565 |
| `pathPrefix: "imported/"` | 506 | 565 |
| `pathPrefix` inexistente | 50 | 565 |
| sem filtro | 565 ✅ | 565 |

Os totais filtrados de `_shared/` (5) e `imported/` (483) saíram certos apenas por acidente de
layout: nesses diretórios não há mistura de notas correspondentes e não-correspondentes.

### Correção: uma palavra

```js
-                  return;
+                  continue;
```

Validado numa cópia da função — todos os números passaram a bater com a verdade de campo:

| Chamada | Antes | Com `continue` | Verdade |
|---|---|---|---|
| `imported/arquitetura/rag` | 0 | **8** | 8 |
| `_shared/` | 5 (vault 54) | **5 (vault 565)** | 5 / 565 |
| `imported/` | 483 (vault 506) | **483 (vault 565)** | 483 / 565 |
| sem filtro | 565 | **565** | 565 |

---

## 6. Busca — sem regressão

Benchmark de 26 consultas na configuração real (e5, índice real), idêntico ao da rodada anterior:

| Métrica | Rodada anterior | Agora |
|---|---|---|
| Grupo A — R@1 (PT → nota EN) | 15/16 (94%) | **15/16 (94%)** |
| Grupo B — R@1 (PT → nota PT) | 10/10 (100%) | **10/10 (100%)** |
| **TOTAL — R@1** | 25/26 (96%) | **25/26 (96%)** |
| **TOTAL — R@3** | 26/26 | **26/26** |
| **TOTAL — MRR** | 0.981 | **0.981** |

Nada nas mudanças de `pending.js`, `validate_vault.js` ou `vectorStore.js` afetou o ranking.

---

## 7. Checklist para publicar

| | Item | Status |
|---|---|---|
| ☑ | **B1**, **B4**, **B7**, **N1–N4**, **N6** | ✅ |
| ☑ | **B2** — paginação (117.651 → 3.785 chars) | ✅ |
| ☑ | **B2b** — mensagens e rótulos | ✅ |
| ☑ | **R1** — cross-lingual (69% → 96% R@1) | ✅ |
| ☑ | **R2** — guarda de índice legado | ✅ |
| ☑ | **B8** — wiki-links de skills | ✅ |
| ☐ | **R3** — `pathPrefix` perde notas | ❌ **Bloqueador (1 palavra)** |
| ☐ | **B3** — payload de 22k tokens + rótulo "Erros" | ⚠️ Médio |
| ☐ | **N5** — escala de `minScore` | ⚠️ Baixo |
| ☐ | **R2b** — aviso de índice também no resultado da busca | ⚠️ Baixo |
| ☐ | **B5** — `read_note` duplica frontmatter | Pendente |
| ☐ | **B6** — sem `delete` em guidelines/profiles | Pendente |

**Só o R3 impede publicar** — e é `return` → `continue`. B3 vale uma segunda passada pelo custo
de tokens, mas não é bloqueador porque o gate (o problema original) está resolvido.

---

## Reprodução

Em `/tmp/claude-1000/-home-jean-Projects-Rimatur/6a84597d-1133-43a7-8ff9-137a3f4c0196/scratchpad/`:
`mcpcall.js` (B2 nas 7 variações), `b2bug.js` (prova do R3), `b3b8.js` (B3 + B8),
`bench3.js` (26 consultas). Executar de dentro de `/home/jean/Projects/local_rag_obisidian_project`.
