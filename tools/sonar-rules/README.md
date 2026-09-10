# tools/sonar-rules

Extrai as regras ativas do SonarQube e publica **toda** a documentação delas como notas do vault.
O vault é a única fonte da verdade: nenhum projeto guarda cópia dos documentos.

## Uso

```bash
python3 publish_vault_notes.py --refresh   # rebaixa da API e reescreve as 35 notas
python3 publish_vault_notes.py --dry-run   # mostra as notas e o tamanho, sem escrever
python3 sonar_rules.py --refresh           # só atualiza cache + out/regras.index.json
```

Sem dependências externas (stdlib do Python 3). Depois de publicar, reindexe o vault
(`reindex_vault` do MCP obsidian-rag).

## Credenciais

Nesta ordem: `SONAR_TOKEN` → `~/.config/sonar-rules/token` → `sonar.token` de um
`sonar-project.properties` no diretório atual. Nenhum token é versionado aqui.
Host e projeto de referência: `SONAR_HOST`, `SONAR_PROJECT_KEY`.

## Arquivos

| Arquivo | Papel |
|---|---|
| `sonar_rules.py` | biblioteca: API, cache, índice por número de regra e a curadoria (`CURADAS`) |
| `publish_vault_notes.py` | gera as notas do vault e o `curadoria.json` da skill `/sonar-gate` |
| `out/` | cache do dump bruto e índices (não versionado) |

## Notas geradas em `references/_shared/sonar/`

- `shared-sonar-index` — índice, critério do gate e instruções de regeneração
- `shared-sonar-regras-<categoria>[-pN]` — as 76 regras obrigatórias com exemplos oficiais
- `shared-sonar-catalogo-<grupo>[-pN]` — catálogo exaustivo das 1242 regras ativas

Cada nota respeita o limite de 200 linhas do vault; categorias e catálogos grandes são
quebrados em partes automaticamente (`ORCAMENTO_REGRAS`, `ORCAMENTO_CATALOGO`).

## Curadoria

`CURADAS`, no topo de `sonar_rules.py`: cada entrada é `(número da regra, categoria,
diretriz em PT-BR)`. Nome oficial, severidade, linguagens, limites e exemplos vêm da API —
não são escritos à mão. Regra que sair do Quality Profile é ignorada na geração.

## Gate

A skill `~/.claude/skills/sonar-gate/` consome o `curadoria.json` gerado aqui e checa um
projeto antes do merge request. Regenerar as notas mantém gate e documentação em sincronia.
