---
topic: "Project Context Template"
tags:
  - meta/template
  - meta/project-context
sources: ["https://github.com/anomalyco/opencode"]
verified_by_reviewer: false
last_updated: "2026-06-18T15:00:00Z"
token_density:
  line_count: 41
  character_count: 1068
---

# Project Context Template

## Stack
| Camada | Tecnologia | Versão |
|--------|------------|--------|
| Frontend | Next.js | 15.x |
| Backend | AdonisJS | 7.x |
| Database | PostgreSQL | 16.x |
| ORM | Lucid | latest |

## Decisões Arquiteturais
- **Auth**: Session guard (cookies) — não JWT
- **Validation**: VineJS
- **State**: Server Components por padrão

## Convenções de Código
- Controllers: `app/controllers/{resource}_controller.ts`
- Models: `app/models/{entity}.ts`
- Validators: `app/validators/{resource}.ts`
- Services: `app/services/{domain}.ts`
- Frontend: `app/frontend/components/{component}.tsx`

## Notas Existentes (exemplos)
- [[shared-nodejs-event-loop]]
- [[proj-megabrain-adonisjs7-auth]]

## Contexto Adicional
(Notas sobre decisões específicas do projeto, APIs internas, etc.)