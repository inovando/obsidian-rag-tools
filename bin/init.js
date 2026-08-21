#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();

console.log(`Inicializando novo RAG Obsidian Vault em: ${targetDir}`);

// Criação de pastas necessárias
const dirsToCreate = [
  targetDir,
  path.join(targetDir, 'templates'),
  path.join(targetDir, 'references'),
  path.join(targetDir, 'references', '_shared')
];

for (const dir of dirsToCreate) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`  ✓ Criado diretório: ${path.relative(process.cwd(), dir) || '.'}`);
  }
}

// Copiar diretório .obsidian do pacote instalado se existir
const pkgObsidianDir = path.resolve(__dirname, '..', '.obsidian');
const destObsidianDir = path.join(targetDir, '.obsidian');
if (fs.existsSync(pkgObsidianDir)) {
  if (!fs.existsSync(destObsidianDir)) {
    fs.cpSync(pkgObsidianDir, destObsidianDir, { recursive: true });
    console.log(`  ✓ Copiado diretório de configurações do Obsidian: .obsidian/`);
  }
}

// Copiar templates do pacote instalado
const pkgTemplatesDir = path.resolve(__dirname, '..', 'templates');
if (fs.existsSync(pkgTemplatesDir)) {
  const files = fs.readdirSync(pkgTemplatesDir);
  for (const file of files) {
    const src = path.join(pkgTemplatesDir, file);
    const dest = path.join(targetDir, 'templates', file);
    fs.copyFileSync(src, dest);
    console.log(`  ✓ Copiado template: templates/${file}`);
  }
}

// Copiar documentação básica (README.md, AGENTS.md) se não existirem
const docsToCopy = ['README.md', 'AGENTS.md', 'PROJECT.md'];
for (const doc of docsToCopy) {
  const src = path.resolve(__dirname, '..', doc);
  const dest = path.join(targetDir, doc);
  if (fs.existsSync(src)) {
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
      console.log(`  ✓ Copiado documento: ${doc}`);
    }
  }
}

// Criar um arquivo index padrão em references/_shared/_index.md
const sharedIndexDest = path.join(targetDir, 'references', '_shared', '_index.md');
if (!fs.existsSync(sharedIndexDest)) {
  const boilerplateIndex = `---
topic: "Knowledge Base Index"
tags:
  - "shared"
  - "index"
sources:
  - "https://github.com/inovando/obsidian-rag-tools"
verified_by_reviewer: false
last_updated: "${new Date().toISOString().split('T')[0]}"
token_density:
  line_count: 14
  character_count: 275
---

# Base de Conhecimento RAG

Bem-vindo ao seu RAG-Optimized Obsidian Vault.

Esta pasta contém notas técnicas de referência otimizadas para consumo por modelos de linguagem (LLMs).
`;
  fs.writeFileSync(sharedIndexDest, boilerplateIndex, 'utf8');
  console.log(`  ✓ Criado índice inicial: references/_shared/_index.md`);
}

console.log('\nInicialização concluída com sucesso!');
console.log('Agora você pode rodar os comandos do pacote:');
console.log('  npx obsidian-rag-validate [diretório]  - Para validar a estrutura e integridade do vault');
console.log('  npx obsidian-rag-fix-density [diretório] - Para recalcular a densidade de tokens das notas');
console.log('  npx obsidian-rag-mcp                     - Para iniciar o servidor MCP STDIO');
