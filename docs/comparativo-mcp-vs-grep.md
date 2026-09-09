# Comparativo — Responder a mesma pergunta COM MCP vs SEM MCP

| | |
|---|---|
| **Versão** | `@inovan.do/obsidian-rag-tools` 1.2.6 |
| **Data** | 2026-09-03 |
| **Amostra** | **26 perguntas** em português, com resposta correta conhecida (1 nota específica do vault) |
| **Vault** | 595 notas · 2.812 chunks · ~333.578 tokens · índice de 33,2 MB |

## Os dois caminhos medidos

**Caminho A — COM MCP.** Uma chamada a `query_knowledge_base` no servidor real, via JSON-RPC stdio.
O payload medido é exatamente o texto que entra no contexto do agente, já com o excerpt do trecho
relevante.

**Caminho B — SEM MCP.** O que um agente faz num vault sem RAG: extrai as palavras-chave da
pergunta, roda `grep -ril --include=*.md` para cada termo, ranqueia os arquivos por quantos termos
casaram e lê o 1º colocado por inteiro. É o fluxo padrão de busca em base de arquivos.

> Tokens estimados por `caracteres / 4`. O caminho B recebe o benefício da dúvida: ranking
> multi-termo (não um grep único) e leitura de apenas 1 arquivo.

---

## Resultado agregado

| Métrica | **COM MCP** | **SEM MCP (grep)** | Diferença |
|---|---|---|---|
| **Acerto em 1º lugar (R@1)** | **25/26 (96%)** | 2/26 (8%) | **12,5× melhor** |
| **Correta no top-3 (R@3)** | **26/26 (100%)** | 10/26 (38%) | **2,6× melhor** |
| Precisão@5 | 26/26 | 12/26 | 2,2× |
| Precisão@10 | 26/26 | 15/26 | 1,7× |
| **MRR** | **0,981** | 0,279 | **3,5× melhor** |
| Buscas sem resultado | 0 | 0 | — |
| **Tokens totais no contexto** | **24.007** | 102.749 | **4,3× menos** |
| Tokens médios por pergunta | **923** | 3.952 | 4,3× menos |
| Pior caso de tokens | **1.095** | 10.547 | 9,6× menos |
| Chamadas de ferramenta | **26** | 122 | 4,7× menos |
| Candidatos a filtrar (mediana) | **5** | 70 (máx. 254) | 14× menos |
| Tempo total | 17.972ms | **2.419ms** | grep é 7,4× mais rápido |
| Tempo médio por pergunta | 691ms | **93ms** | grep é 7,4× mais rápido |
| **Custo por resposta correta em 1º** | **960 tokens** | 51.375 tokens | **53× mais barato** |

### Onde a nota correta caiu no ranking do grep

| Posição | Casos |
|---|---|
| 1º | 2 de 26 |
| 2º–3º | 8 de 26 |
| 4º–10º | 5 de 26 |
| **11º ou pior** | **11 de 26** |

Em 11 das 26 perguntas a resposta certa ficou depois da 10ª posição — na prática, invisível para
um agente que examina os primeiros resultados.

---

## Leitura dos números

**Precisão é onde o MCP ganha, e ganha muito.** O grep acerta o 1º lugar em 2 de 26 perguntas. O
motivo é estrutural: ele casa **substring**, não significado. `"como é calculado o desconto noturno
na precificação"` gera 254 candidatos porque "precificação" aparece em dezenas de notas — e a nota
específica sobre marcos temporais do desconto noturno não se distingue das outras por contagem de
termos. O MCP resolve isso por similaridade vetorial: a nota correta vem em 1º com semantic 0,9.

**O caso cross-lingual o grep simplesmente não resolve.** Metade do vault (`_shared/*`) tem corpo
em inglês. Uma pergunta em português como `"ganchos de estado e efeito no React"` não contém
nenhum termo literal presente em `shared-react-hooks.md` além de "react" — que casa em 100+ notas.
O grep não tem como pontuar isso; o embedding multilíngue tem.

**Tokens: 4,3× de diferença, e é conservador.** O caminho B consome 102.749 tokens porque
precisa (a) absorver a lista de candidatos do grep — 47.264 tokens só de caminhos de arquivo — e
(b) ler o arquivo inteiro do 1º colocado, 55.485 tokens. E como o 1º colocado do grep está errado
em 24 dos 26 casos, na prática o agente leria 2, 3 ou mais arquivos até achar a resposta,
multiplicando esse custo. O número real de um fluxo sem RAG é bem pior que 4,3×.

**Velocidade é o único ponto do grep** — 93ms contra 691ms. Mas o tempo do MCP é dominado por um
gargalo evitável, não pelo modelo:

| Etapa de uma consulta MCP | Tempo |
|---|---|
| `readFileSync` do índice (33,2 MB) | 390ms |
| `JSON.parse` do índice | 151ms |
| **Embedding da consulta (ONNX)** | **18ms** |
| Restante (BM25, RRF, formatação) | ~1ms |
| **Total (mediana)** | **~560ms** |

**96% do tempo é reler e reparsear o índice de 33 MB do disco a cada consulta.** O trabalho de IA
custa 18ms. Um cache em memória invalidado por `mtime` levaria a consulta para a faixa de 20–30ms
— aí o MCP seria mais rápido que o grep *e* mais preciso.

> Nota sobre o `get_mcp_metrics`: ele reporta P50 de 28ms, o que não contradiz os 560ms medidos
> aqui — a métrica é agregada sobre as 14 ferramentas, e chamadas baratas (`list_skills`,
> `read_note`) dominam a mediana. Isolada, uma consulta semântica custa ~560ms.

---

## Conclusão

Para **recuperação de conhecimento**, o MCP não é uma conveniência: é a diferença entre 96% e 8%
de acerto. O grep só empata quando a pergunta contém, literalmente, um termo raro que existe em
poucas notas — 2 casos em 26. Nos outros 24 o agente sem RAG ou lê o arquivo errado, ou queima
milhares de tokens lendo vários até acertar.

O custo por resposta correta resume tudo: **960 tokens com MCP contra 51.375 sem**.

A recomendação técnica que sai desta medição é uma só: **cachear o índice parseado em memória**.
É o único eixo em que o caminho sem MCP ainda vence, e são 541 dos 560ms.

---

## Detalhamento por pergunta

`pos` = posição da nota correta · `tok` = tokens que entram no contexto ·
`cand` = candidatos devolvidos pelo grep · tokens do grep incluem a leitura do 1º colocado

| Pergunta | pos MCP | tok MCP | pos grep | cand grep | tok grep |
|---|---|---|---|---|---|
| Como funciona validação de schema com Yup em formulários React? | **1** | 784 | 7 | 107 | 2978 |
| padrões de validação Yup condicional when e transform | **1** | 770 | 9 | 157 | 4042 |
| Como funciona o event loop do Node.js | **1** | 860 | 3 | 70 | 2290 |
| padrões de assincronismo e emissor de eventos no Node | **2** | 869 | 43 | 105 | 3191 |
| módulos nativos de sistema de arquivos e streams do Node | **1** | 1066 | 9 | 113 | 3751 |
| cache e busca de dados com React Query | **1** | 898 | 12 | 141 | 8305 |
| estrutura de rotas do App Router no Next.js | **1** | 1026 | 20 | 235 | 10547 |
| estratégias de renderização SSR e ISR no Next.js | **1** | 918 | 4 | 33 | 1446 |
| como fazer busca de dados e cache no Next.js | **1** | 933 | 28 | 102 | 7112 |
| ganchos de estado e efeito no React | **1** | 936 | 22 | 59 | 2107 |
| componentes de servidor e de cliente no React | **1** | 1000 | 47 | 72 | 6545 |
| renderização concorrente e transições no React | **1** | 1009 | 23 | 49 | 1294 |
| integração do yupResolver com React Hook Form | **1** | 795 | 4 | 230 | 5521 |
| migrações e ORM Lucid no AdonisJS 4 | **1** | 1020 | 28 | 254 | 10448 |
| injeção de dependência e contêiner IoC no AdonisJS 7 | **1** | 883 | 15 | 67 | 2009 |
| padrões de componentes de interface com Chakra UI | **1** | 834 | 16 | 68 | 1923 |
| como é calculado o desconto noturno na precificação | **1** | 1093 | 2 | 21 | 1878 |
| regra de continuidade entre veículo e motorista | **1** | 971 | 2 | 65 | 3082 |
| otimização do tempo de espera e do deslocamento nas rotas | **1** | 1095 | 2 | 80 | 2983 |
| crédito retroativo de veículo quando o serviço cruza a meia-noite | **1** | 1036 | 2 | 47 | 2620 |
| visão geral do algoritmo de simulação de estoque | **1** | 768 | 2 | 40 | 2231 |
| duplicação de jornadas otimizadas | **1** | 862 | 1 | 14 | 1462 |
| padrão de validators do AdonisJS 4 no projeto Rimatur | **1** | 967 | 13 | 106 | 7561 |
| transformers Bumblebee de serialização no Rimatur | **1** | 811 | 2 | 44 | 2407 |
| controle de acesso e permissões RBAC no Rimatur | **1** | 936 | 1 | 61 | 2975 |
| especificação do módulo financeiro do ERP Luccaro | **1** | 867 | 2 | 56 | 2041 |
O único caso em que o MCP não fica em 1º (`"padrões de assincronismo e emissor de eventos no Node"`,
2º lugar) é ambiguidade legítima de conteúdo — e mesmo ali o grep colocou a resposta em **43º**.

## Reprodução

`comparativo.js` (as 26 perguntas nos dois caminhos, servidor MCP real via JSON-RPC) e
`decompor.js` (decomposição da latência e métricas de distribuição), em
`/tmp/claude-1000/-home-jean-Projects-Rimatur/6a84597d-1133-43a7-8ff9-137a3f4c0196/scratchpad/`.
Executar de dentro de `/home/jean/Projects/local_rag_obisidian_project`.
