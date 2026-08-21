# AGENTS.md — Instruções para LLMs

## Objetivo
Este vault é uma base de conhecimento RAG otimizada para gerar código preciso.
Cada LLM DEVE seguir estas regras ao ler/escrever notas.

## Estrutura
/references/
├── _shared/          # Notas globais (nodejs, react base)
├── proj-webapp/      # Projeto: Next.js 15 + AdonisJS 7
├── proj-legacy/      # Projeto: Next.js 14 + AdonisJS 4

## Handoff / Memória entre Sessões
Ao finalizar uma sessão, o modelo DEVE:
1. Criar/atualizar `.agents/handoffs/NOME.md` com:
   - `status`: in_progress | completed | blocked
   - `session_id`: identificador único
   - `previous_session`: link para sessão anterior
   - Resumo do completado
   - Estado atual e próxima ação
   - Decisões tomadas
   - Tarefas pendentes
2. Ao iniciar, o modelo DEVE:
   - Ler `.agents/handoffs/` mais recente
   - Revisar `AGENTS.md` e `_project.md` do projeto alvo
   - Continuar da onde o modelo anterior parou

## Regras para Criar Notas
1. SEMPRE ler `_project.md` do projeto alvo primeiro
2. Buscar doc oficial via context7 MCP
3. Seguir frontmatter de templates/note_template.md
4. Tags DEVEM usar namespace: `proj-{slug}/{stack}/{topic}`
5. Máx. 200 linhas (token-dense)
6. Código copy-pasteable e funcional
7. `verified_by_reviewer: false` (SEMPRE — humano revisa)
8. Atualizar `last_updated` com data ISO-8601
9. Calcular `token_density` real (line_count + character_count)

## Regras para Atualizar Notas
1. Ler nota existente via obsidian MCP
2. Manter frontmatter existente
3. Atualizar `last_updated`
4. Recalcular `token_density`
5. `verified_by_reviewer: false` (resetar para humano revisar)

## Namespaces de Tags
- `_shared/{stack}` — notas globais (ex: `_shared/nodejs`, `_shared/react`)
- `proj-{slug}/{stack}/{topic}` — notas do projeto (ex: `proj-webapp/adonisjs7/auth`)
- `{stack}/{topic}` — tópico global (ex: `nodejs/event-loop`)

## Links Cross-Project
- Permitidos com aviso (warn)
- Usar path relativo: `[[_shared/nodejs/shared-nodejs-event-loop]]`
- Nota em proj-webapp pode linkar para proj-legacy se necessário

## Validação
- Rodar `node validate_vault.js` após escrever/atualizar
- Exit code 0 = OK, 1 = erros
- Warnings são aceitáveis (links para notas futuras, verified_by_reviewer: false)

## Skills de Tecnologia (Agentes Especializados)

Skills em `.agents/skills/{tecnologia}/SKILL.md` — carregue com `skill` tool para ativar contexto especializado:

| Skill | Descrição |
|-------|-----------|
| `chakra-ui` | Componentes, theming, responsividade, composite components |
| `react-query` | Data fetching, mutations, cache, optimistic updates |
| `react-hook-form` | Formulários, Controller, useFieldArray, resolvers |
| `yup` | Schema validation, when, test, locale PT-BR |

Ao ativar um skill, o modelo DEVE:
1. Ler o SKILL.md correspondente
2. Seguir os patterns e regras definidos
3. Consultar as notas do vault referenciadas no skill
4. Usar o checklist de code generation ao final

## Setup Automático em Clientes LLM
Você pode rodar o setup automático para injetar estas regras de IA (como `.cursorrules` e `.github/copilot-instructions.md`) e configurar os servidores MCP no seu ambiente rodando:
`npx @inovando/obsidian-rag-tools obsidian-rag-setup` (ou `node bin/setup.js` localmente).
Isso configurará automaticamente Claude Desktop, Cursor, OpenCode/VSCode, Copilot/Codex e Antigravity.

## MCP Tools Disponíveis
- `obsidian_mcp`: read, write, search notes
- `context7`: query official documentation
- `skill`: load specialized skill instructions