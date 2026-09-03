---
topic: "Proj-WebApp LLM Context"
tags:
  - proj-webapp
  - meta/llm-context
  - stack/adonisjs7
  - stack/nextjs
sources: ["https://docs.adonisjs.com", "https://nextjs.org/docs"]
verified_by_reviewer: false
last_updated: "2026-06-18T15:00:00Z"
token_density:
  line_count: 51
  character_count: 1546
---

# Proj-WebApp — Contexto para LLM

## Stack
| Camada | Tecnologia | Versão |
|--------|------------|--------|
| Frontend | Next.js | 15.x (App Router, RSC) |
| Backend | AdonisJS | 7.x (TypeScript, ESM) |
| Database | PostgreSQL | 16.x |
| ORM | Lucid | latest (decorators) |
| Validation | VineJS | latest |
| Auth | @adonisjs/auth | session guard |

## Referências Base (ler primeiro)
- [[shared-adonisjs7-setup-ioc-di]]
- [[shared-adonisjs7-routing-lucid-middleware]]
- [[shared-nextjs-app-router]]
- [[shared-nextjs-rendering-strategies]]
- [[shared-nextjs-data-fetching-caching]]

## Notas Específicas do Projeto (a criar)
- [[proj-megabrain-adonisjs7-auth]]
- [[shared-adonisjs7-setup-ioc-di]]
- [[shared-adonisjs7-routing-lucid-middleware]]
- [[shared-nextjs-app-router]]
- [[shared-nextjs-data-fetching-caching]]

## Decisões do Projeto
- Auth: Session guard (cookies) + CSRF protection
- Server Components: padrão para listagens
- Client Components: apenas interatividade (forms, modals)
- Validation: VineJS schemas em `app/validators/`

## Convenções
- Controllers: `app/controllers/{resource}_controller.ts`
- Models: `app/models/{entity}.ts` (com `withAuthFinder(hash)`)
- Frontend: `app/frontend/components/{component}.tsx`