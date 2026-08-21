# Project: RAG-Optimized Obsidian Vault Reference Base

## Architecture
- Directory layout:
  - `/templates` - Frontmatter and note structure templates
  - `/references/nodejs` - Node.js modular notes (event loop, core APIs, async patterns)
  - `/references/react` - React modular notes (hooks, server vs client component, concurrent rendering)
  - `/references/nextjs` - Next.js modular notes (app router, rendering strategies, data fetching/caching)
  - `/references/adonisjs4` - AdonisJS 4 legacy modular notes (structure, routing, Lucid ORM, migrations, middleware)
  - `/references/adonisjs7` - AdonisJS 7 TS modular notes (setup, IoC/DI, routing, Lucid ORM, modern middleware/validation)
  - `/configs` - configuration templates for Obsidian local REST API and context7 local config
  - `validate_vault.js` - automated Node.js validation script at root
  - `.gitignore` - git ignore rules for Obsidian
  - `README.md` - mapping and usage guide
- YAML Frontmatter Schema:
  - `topic`: string
  - `tags`: array of strings
  - `sources`: array of strings (official documentation URLs)
  - `verified_by_reviewer`: boolean
  - `last_updated`: string (ISO datetime or date)
  - `token_density`: object or metadata fields (e.g., line_count, character_count)

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Infrastructure & Templates | Folders, templates, git setup, .gitignore, README.md, configs | None | DONE |
| 2 | Node.js & React Reference Notes | Draft and review tech references for Node.js and React | M1 | DONE |
| 3 | Next.js & Adonis Reference Notes | Draft and review tech references for Next.js, Adonis 4, Adonis 7 | M2 | DONE |
| 4 | Validator Script | Implement automated `validate_vault.js` | M1 | DONE |
| 5 | E2E Pass & Verification | Verify all tests pass, run auditor, finalize | M3, M4 | DONE |

## Interface Contracts
### Validator Script CLI
- Entrypoint: `node validate_vault.js`
- Exit code: 0 on success, non-zero on validation error
- Output: Structured report listing errors by file

### Tech Note Structure Contract
- Must contain YAML frontmatter
- File extension must be `.md`
- Must not have any broken link `[[Link]]`
- Must not exceed line limits (e.g., 200 lines max for token-dense/modular RAG notes)
