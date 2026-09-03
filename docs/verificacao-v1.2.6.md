# Verificação — v1.2.6

| | |
|---|---|
| **Versão** | 1.2.6 |
| **Data** | 2026-09-03 |
| **Método** | Bateria de testes de integração via `node` + validação do vault |

---

## O que foi corrigido

### 1. **R5 — Atualização do Índice Vetorial em `move_note` & `delete_note` + Expurgo de Órfãos**
- **Bug Anterior:** Movimentações de notas via `move_note` alteravam os arquivos em disco mas mantinham o índice vetorial no caminho antigo. As notas ficavam invisíveis na busca semântica RAG até que um `reindex_vault` completo fosse rodado, gerando também chunks órfãos permanentes.
- **Correção:**
  - `lib/tools/move.js`: Atualizado para função `async`. Remove chunks do caminho antigo via `updateNoteInIndex(targetDir, cleanOld, '')` e re-indexa a nota no caminho novo.
  - `lib/tools/delete.js`: Atualizado para função `async`. Expurga os chunks da nota deletada via `updateNoteInIndex(targetDir, cleanRel, '')`.
  - `lib/rag/vectorStore.js`: Adicionada purga dinâmica em `searchVectorStore` e `updateNoteInIndex` para expurgar automaticamente chunks cujos arquivos fonte não existem mais em disco (prevenindo acúmulo de órfãos sob qualquer condição).
  - `mcp-server.js`: Atualizado o dispatch para `await handleMoveNote` e `await handleDeleteNote`.
- **Validação:** Teste determinístico com termo único (`bergamota9911`):
  - Nota escrita -> encontrada via busca semântica em 1º lugar (score 0.85).
  - Nota movida -> encontrada imediatamente no **novo caminho** em 1º lugar (score 0.85); chunks no caminho antigo = 0.
  - Nota deletada -> chunks no novo caminho = 0.

### 2. **R4 — Formatação do Modo Compacto em `query_knowledge_base`**
- **Bug Anterior:** Em consultas com `compact: true`, `excerpt` é omitido para economizar tokens, mas o `formatToolResult` no `mcp-server.js` renderizava `**Trecho:**\nundefined`.
- **Correção:** `mcp-server.js` agora só renderiza o bloco `**Trecho:**` se `excerpt` for diferente de `undefined`.
- **Validação:** Confirmado output limpo em modo compacto sem a string `undefined` ou `Trecho:`.

### 3. **Otimização de Tokens no `get_pending_reviews`**
- **Melhoria:** O resumo por pasta (`📊 Resumo de Pendências por Pasta:`) agora é exibido apenas na primeira página (`offset === 0`), poupando ~1.2k caracteres nas páginas subsequentes da paginação.

---

## Validação do Vault

```bash
node validate_vault.js
```

**Resultado:**
```
Validation complete: 0 errors, 642 warnings
0 errors found
validation passed
```
