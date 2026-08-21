---
topic: "Proj-Legacy LLM Context"
tags:
  - proj-legacy
  - meta/llm-context
  - stack/adonisjs4
  - stack/nextjs
sources: ["https://legacy.adonisjs.com", "https://nextjs.org/docs"]
verified_by_reviewer: false
last_updated: "2026-06-18T15:00:00Z"
token_density:
  line_count: 45
  character_count: 1314
---

# Proj-Legacy — Contexto para LLM

## Stack
| Camada | Tecnologia | Versão |
|--------|------------|--------|
| Frontend | Next.js | 14.x (Pages Router) |
| Backend | AdonisJS | 4.1 (Legacy) |
| Database | PostgreSQL | 14.x |
| ORM | Lucid | v4 (legacy) |
| Validation | adonis-validator | v4 |
| Auth | @adonisjs/auth | v4 session guard |

## Referências Base (ler primeiro)
- [[shared-adonisjs4-structure-routing-controllers]]
- [[shared-adonisjs4-lucid-orm-migrations-middleware]]
- [[shared-nextjs-app-router]] (comparar com Pages Router)

## Notas Específicas do Projeto
(proj-legacy/nextjs/* e proj-legacy/adonisjs4/* a serem criadas)

## Decisões do Projeto
- Auth: v4 session guard (diferente do v7)
- Routing: string-based (`Route.get()`)
- Models: `use()` IoC (não decorators)
- Validation: `Validator.make()` (não VineJS)

## Convenções
- Controllers: `app/Controllers/Http/{Resource}Controller.js`
- Models: `app/Models/{Entity}.js`
- Migrations: `database/migrations/{timestamp}_{table}.js`