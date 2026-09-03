# Estratégia de Idioma para o RAG — PT-BR vs. Modelo de Embeddings

**Pergunta:** as documentações deveriam ser escritas em inglês para o RAG funcionar, ou há como
melhorar o suporte a português?

**Resposta curta: não reescreva nada em inglês.** O problema é o modelo de embeddings, não o
idioma das notas. Trocar o modelo é uma variável de ambiente + reindexação, e resolve o caso que
falhava. Reescrever ~596 notas em inglês seria o caminho mais caro e ainda pioraria a experiência
do time.

**O ganho foi medido ponta a ponta em 26 consultas: acerto em 1º lugar sobe de 69% para 96%,
sem nenhuma regressão e sem custo de latência.** Ver seção 2.

---

## 1. Medição: o problema é o modelo

Teste no caso real que falhava — consulta em PT contra a nota `_shared/yup/...` (corpo em inglês),
tendo como distratora a nota `rimatur/precificacao/premissa-validacao-cenario-real-front.md`
(corpo em PT), que era quem vencia indevidamente.

Similaridade de cosseno sobre os 13 chunks do alvo e 6 do distrator:

| Modelo | Disco | Dims | PT→alvo | PT→distrator | Acerta? | Lacuna EN−PT |
|---|---|---|---|---|---|---|
| **`all-MiniLM-L6-v2`** (atual) | 23 MB | 384 | 0.330 | **0.468** | ❌ **NÃO** (−0.139) | **+0.318** |
| **`multilingual-e5-small`** | 130 MB | 384 | **0.900** | 0.867 | ✅ SIM (+0.033) | **−0.030** |
| `paraphrase-multilingual-MiniLM-L12-v2` | 130 MB | 384 | 0.562 | 0.539 | ✅ SIM (+0.023) | +0.093 |

Leitura dos números:

- O modelo atual tem uma **lacuna cross-lingual de +0.318** — a mesma pergunta em inglês pontua
  0.318 acima da versão em português. É o que faz a nota certa desaparecer da janela de recall.
- `multilingual-e5-small` **elimina a lacuna** (−0.030: o PT ficou marginalmente melhor que o EN)
  e inverte o resultado a favor da nota correta.
- Ambos os multilíngues mantêm **384 dimensões**, iguais ao atual — o formato de
  `.obsidian/rag-index.json` não muda e nenhum código de armazenamento precisa ser tocado.
- Os 130 MB são do pacote **quantizado**, que é o que o projeto já usa (`quantized: true` em
  `lib/rag/embeddings.js:56`). Corrijo aqui a estimativa de ~470 MB que dei no relatório anterior:
  era o tamanho fp32, não o que será realmente baixado.

**Recomendação: `Xenova/multilingual-e5-small`.**

---

## 2. O ganho é mensurável? Sim — medição ponta a ponta

O teste da seção 1 era 1 caso, o que não sustenta a decisão. Então reindexei o vault inteiro com
`multilingual-e5-small` (595 arquivos, 2.812 chunks) e rodei um benchmark de **26 consultas com
resposta correta conhecida**, todas em português, dividido em dois grupos:

- **Grupo A (16 casos)** — consulta PT → nota com **corpo em inglês** (`_shared/*`): é o caso
  cross-lingual, onde o ganho deve aparecer.
- **Grupo B (10 casos)** — consulta PT → nota com **corpo em português** (`rimatur/precificacao`,
  `proj-rimatur`, `projetos/luccaro`): controle de regressão.

A medição foi feita num vault espelhado por symlink, com índice próprio — o
`.obsidian/rag-index.json` real não foi tocado.

### Resultado

| Métrica | `all-MiniLM-L6-v2` (atual) | `multilingual-e5-small` | Δ |
|---|---|---|---|
| **Grupo A — R@1** | 8/16 (**50%**) | 15/16 (**94%**) | **+44 pts** |
| Grupo A — R@3 | 12/16 | **16/16** | +4 |
| Grupo A — MRR | 0.625 | **0.958** | +0.333 |
| **Grupo B — R@1** | 10/10 (100%) | 10/10 (**100%**) | **0 — nenhuma regressão** |
| Grupo B — MRR | 1.000 | 1.000 | 0 |
| **TOTAL — R@1** | 18/26 (**69%**) | 25/26 (**96%**) | **+27 pts** |
| **TOTAL — R@3** | 22/26 | **26/26 (100%)** | +4 |
| **TOTAL — MRR** | 0.769 | **0.974** | +0.205 |

Leitura:

- **A taxa de erro cai de 8 para 1 consulta em 26.** No modelo atual, 4 consultas do Grupo A não
  traziam a nota certa nem no top-5 — `"ganchos de estado e efeito no React"` devolvia
  `rag-parte-4.md` em 1º, `"busca de dados e cache no Next.js"` devolvia `cache-parte-12.md`.
- **R@3 vira 100%**: com o e5, toda consulta do conjunto tem a nota correta entre as 3 primeiras.
  Para uso por um agente (que lê os 3–5 primeiros), isso é a diferença entre confiar e não confiar
  no retorno.
- **Zero regressão no Grupo B.** Como ele já estava em 100% com o modelo atual, era o risco real
  da troca — e não se materializou.
- O único erro remanescente (`"padrões de assincronismo e emissor de eventos no Node"` → 3º lugar,
  atrás de `10-padroes-arquitetura.md`) é ambiguidade legítima de conteúdo, não falha de idioma.

### Custo medido

| Custo | Medição | Natureza |
|---|---|---|
| Download do modelo | **130 MB** (quantizado) vs 23 MB | uma vez |
| Reindexação completa | **133s** para 2.812 chunks | uma vez |
| Tamanho do índice | **34 MB → 34 MB** (384 dims iguais) | sem mudança |
| **Latência de consulta** | **253ms → 249ms** (mediana de 6 consultas) | **sem custo** |
| Partida a frio (1ª consulta do processo) | 525ms → **1.370ms** (+845ms) | uma vez por processo |

A latência de consulta não muda porque o gargalo é o `getAllNotes()` lendo 595 arquivos, não o
embedding da consulta — gerar o vetor de uma frase curta é barato mesmo com 12 camadas.

**Conclusão: +27 pontos de acerto em 1º lugar, R@3 em 100%, nenhuma regressão, e o único custo
recorrente é zero.** A troca se paga na primeira consulta.

---

## 3. Por que reescrever as notas em inglês é a pior opção

| | Trocar o modelo | Reescrever docs em inglês |
|---|---|---|
| Esforço | 1 env var + 1 reindex (~minutos) | ~596 notas, tradução manual revisada |
| Custo recorrente | zero | toda nota nova precisa ser escrita em EN |
| Consultas em PT | ✅ funcionam | ✅ funcionam (mas piora a nota) |
| Consultas em EN | ✅ funcionam | ✅ funcionam |
| Legibilidade para o time | ✅ mantida | ❌ time brasileiro lendo/escrevendo em 2º idioma |
| Notas de negócio (precificação, TOS, Rimatur) | ✅ naturais em PT | ❌ tradução de termos de domínio que **não têm** equivalente ("TOS Grupos", "rota de entrada") |

O ponto decisivo é o último: boa parte do vault é documentação de **domínio de negócio brasileiro**.
Traduzir "TOS Grupos", "jornada do motorista" ou "prestação de contas" degrada a informação em vez
de melhorá-la. Além disso, o RAG serve para uma IA que responde **em português** ao time — forçar
uma tradução de ida e volta só adiciona perda.

---

## 4. Alavanca extra que já existe no código (custo zero)

`lib/rag/chunker.js:84` já embeda um cabeçalho de metadados em português em cada chunk:

```js
const textToEmbed = `Tópico: ${topic}\nTags: ${tags.join(', ')}\nSeção: ${sec.heading}\nCaminho: ${filePath}\n\n${secContent}`;
```

Ou seja, **cada chunk já tem um gancho em PT**. O problema é que ele está sendo preenchido em
inglês nas notas `_shared/*`:

```yaml
topic: Yup — Schema Validation Patterns      # inglês
tags: [_shared/yup/validation, stack/yup, pattern/validation]
```

Com um modelo multilíngue isso deixa de ser crítico, mas escrever **`topic` e headings em
português** adiciona sinal PT a todos os chunks daquela nota, de graça:

```yaml
topic: Yup — Padrões de Validação de Schema
```

**Convenção que eu recomendo — híbrida, não "tudo em um idioma":**

| Elemento | Idioma | Por quê |
|---|---|---|
| `topic`, headings, prosa explicativa | **Português** | é o que a consulta em PT vai casar |
| Identificadores de código, nomes de API, campos | **Inglês/original** | `yupResolver`, `tos_pi`, `useEffect` — o BM25 casa exato (o `_` agora funciona) |
| `tags` | inglês curto (`stack/yup`) | são chaves de filtro, não texto de busca |
| Blocos de código | como no código real | nunca traduzir |

Isso aproveita as duas metades do híbrido: semântica em PT pela prosa, keyword exato em EN pelos
identificadores.

---

## 5. Como migrar

### 5.1 Passo mínimo

```bash
# .env / configuração do MCP
EMBEDDING_MODEL=Xenova/multilingual-e5-small
```

Depois, **reindexação completa obrigatória** (`reindex_vault` ou `obsidian-rag-index`) — os 2.815
chunks precisam ser regerados no novo espaço vetorial.

### 5.2 Melhoria opcional: prefixos do e5 (+75% de margem)

A família e5 é treinada com prefixos `query:` e `passage:`. Medição no mesmo caso:

```
SEM prefixo   alvo=0.895  distrator=0.877  -> ACERTA (margem 0.019)
COM prefixo   alvo=0.900  distrator=0.867  -> ACERTA (margem 0.033)  <- 75% mais folga
```

**Funciona sem os prefixos** — a migração por env var isolada já resolve. Mas hoje
`generateEmbedding(text)` é chamada igual para consulta e para documento, então aproveitar os
prefixos exige distinguir os dois casos:

```js
// lib/rag/embeddings.js
async function generateEmbedding(text, kind = 'passage') {
  const isE5 = /e5-/i.test(DEFAULT_MODEL);
  const input = isE5 ? `${kind === 'query' ? 'query' : 'passage'}: ${text}` : text;
  // ...
}
// vectorStore.js  -> generateEmbedding(chunk.textToEmbed, 'passage')
// searchVectorStore -> generateEmbedding(queryText, 'query')
```

O `isE5` mantém compatibilidade: qualquer outro modelo continua sem prefixo.

### 5.3 Guarda obrigatória: gravar o modelo no índice

Verifiquei o `.obsidian/rag-index.json`:

```
chaves de topo: ['version', 'updatedAt', 'chunks']     <- nao registra o modelo
dims gravadas:  384                                     <- igual nos 3 modelos testados
```

Como **todos os candidatos têm 384 dimensões**, trocar `EMBEDDING_MODEL` sem reindexar **não
gera erro nenhum**: as escritas incrementais passariam a gravar vetores de um espaço no índice de
outro, e a similaridade viraria ruído silenciosamente. Nenhuma checagem de dimensão pegaria isso.

```js
// ao salvar: store.model = DEFAULT_MODEL;
// ao carregar: if (store.model && store.model !== DEFAULT_MODEL)
//   -> avisar e exigir reindex completo antes de qualquer busca/escrita
```

Vale fazer junto com a troca — é o tipo de bug que só aparece semanas depois como "a busca piorou".

### 5.4 Efeito colateral no `minScore` (reforça o N5)

O e5 comprime a similaridade numa faixa alta e estreita (**0.86–0.90** no teste, contra
0.33–0.47 do modelo atual). O ranking continua correto, mas **qualquer corte por valor absoluto de
score perde sentido** e as margens ficam pequenas (0.033). Isso reforça a sugestão do N5:
o corte deve ser normalizado ou por posição, nunca por similaridade absoluta.

---

## 6. Resumo da decisão

1. **Trocar para `Xenova/multilingual-e5-small`** — resolve a raiz. 130 MB, 384 dims, sem mudança
   de formato de índice.
2. **Manter as notas em português.** Com modelo multilíngue não há penalidade, e o vault é de
   domínio brasileiro.
3. **Adotar a convenção híbrida:** prosa e `topic` em PT, identificadores de código em EN.
4. **Gravar o modelo no `rag-index.json`** e exigir reindex quando mudar — sem isso a troca é
   silenciosamente perigosa.
5. **Opcional:** prefixos `query:`/`passage:` para 75% mais margem.
6. Reavaliar o `minScore` (N5) considerando a nova faixa de similaridade.

---

## Reprodução

Em `/tmp/claude-1000/-home-jean-Projects-Rimatur/6a84597d-1133-43a7-8ff9-137a3f4c0196/scratchpad/`:
`modelos.js` (comparação dos 3 modelos no caso real) e `e5noprefix.js` (com e sem prefixos +
dimensões). Executar com `cd /home/jean/Projects/local_rag_obisidian_project && node <script>`.
