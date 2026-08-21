# RAG-Optimized Obsidian Vault Reference Base

Welcome to the RAG-Optimized Obsidian Vault Reference Base. This vault is structured to serve as a high-density, token-optimized knowledge base for LLMs and local RAG (Retrieval-Augmented Generation) pipelines, containing precise modular reference notes for modern web technologies.

---

## 📂 Vault Mapping & Directory Structure

The repository is organized into distinct subdirectories designed to separate templates, references, configurations, and scripts:

- **`/templates`**: Standardized Markdown layouts and YAML schema definitions for creating consistent, machine-readable notes.
- **`/references`**: Tech stack-specific directories containing modular reference notes:
  - `/references/nodejs`: Node.js event loop, core APIs, and asynchronous patterns.
  - `/references/react`: React hooks, Server/Client components, and concurrent rendering.
  - `/references/nextjs`: Next.js App Router, rendering strategies, and data fetching/caching.
  - `/references/adonisjs4`: Legacy AdonisJS 4 (Lucid ORM, routing, middleware).
  - `/references/adonisjs7`: Modern TypeScript-first AdonisJS 6/7 (IoC/DI, modern Lucid ORM, validations).
- **`/configs`**: Configuration templates for integration:
  - `obsidian-mcp-config.json`: Guide to connect the Obsidian Local REST API to external LLM clients.
  - `context7-config.json`: Setup guide for context7 local MCP server to retrieve official doc mappings.
- **`PROJECT.md`**: Project blueprint, interface contracts, and layout definition.
- **`validate_vault.js`**: An automated Node.js validation script located at the project root to enforce frontmatter schema and link integrity.

---

## 🏷️ Tagging Rules

To ensure reliable querying and metadata filtering, all notes in this vault must adhere to the following tagging rules in their YAML frontmatter:

1. **Stack Hierarchy**: Use lowercase hierarchical tags where applicable (e.g., `nodejs`, `react`, `nextjs`, `adonisjs/v4`, `adonisjs/v6`).
2. **Feature Specificity**: Add tags indicating the specific topic (e.g., `event-loop`, `hooks`, `routing`, `orm`, `middleware`).
3. **Status Tags**:
   - `status/draft`: Note is being written.
   - `status/reviewed`: Note has been signed off by the reviewer (`verified_by_reviewer: true`).
4. **Consistency**: Do not mix casing (use kebab-case for multi-word tags, e.g., `async-patterns`).

---

## 🚀 RAG Optimization Strategy

This vault is explicitly designed to maximize RAG performance and minimize token usage:

- **Token-Dense Modular Design**: Notes are kept short and modular (typically under 200 lines). This ensures that when a section or note is retrieved as a chunk, it is self-contained and highly relevant, preventing context pollution.
- **YAML Frontmatter Metadata**: Standardized schemas allow search agents to instantly filter notes by `topic`, `tags`, and review status before performing full-text or vector searches.
- **Clear Markdown Headings**: Standardized headers (`## Core Architecture`, `## Technical Implementation`, `## Common Gotchas`) establish a consistent structure that helps chunking algorithms divide files intelligently.
- **Copy-Pasteable Code Blocks**: Code snippets are concise, complete, and syntactically correct, ensuring an LLM can immediately extract functional examples without hallucination.

---

## 🛠️ Auto-Configuration & Setup CLI (MCP & LLM Rules)

You can automatically configure the Obsidian RAG MCP server and load the LLM instructions/rules (`AGENTS.md`) into your environment by running the setup command.

### Running Setup

Run the setup CLI from the root of your vault:
```bash
# Using the globally/locally published npm package:
npx @inovan.do/obsidian-rag-tools obsidian-rag-setup [path-to-vault]

# Or when developing locally:
node bin/setup.js [path-to-vault]
```

### What the Setup CLI Configures:
1. **Claude Desktop**: Auto-detects and adds the MCP server to `claude_desktop_config.json`.
2. **Cursor**: Creates a `.cursorrules` file in the root of the vault so the AI assistant automatically follows the rules in `AGENTS.md`. Also provides copy-paste steps for the Features Settings UI.
3. **VS Code / OpenCode**: Auto-configures the **Continue** extension (`~/.continue/config.json`) and **Cline/Roo Code** settings.
4. **GitHub Copilot / Codex**: Generates `.github/copilot-instructions.md` with system guidelines.
5. **Antigravity / Antigravity IDE**: Registers the MCP server schemas and instructions under the local Antigravity directory (`~/.gemini/antigravity/mcp/obsidian-rag/`).

---

## 🔗 Instructions on Linking to GitHub

To link this local vault to your personal GitHub repository, follow these steps in your terminal:

1. **Create a GitHub Repository**:
   Create a new, empty repository on GitHub (do not initialize it with README, license, or gitignore).

2. **Add Remote URL**:
   Run the following command in the project root folder:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY_NAME.git
   ```

3. **Rename Default Branch (Optional but recommended)**:
   ```bash
   git branch -M main
   ```

4. **Add and Commit Existing Files**:
   ```bash
   git add .
   git commit -m "feat: init infrastructure and templates for RAG-Optimized Obsidian Vault"
   ```

5. **Push to GitHub**:
   ```bash
   git push -u origin main
   ```
