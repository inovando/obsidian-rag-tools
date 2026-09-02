#!/usr/bin/env node
const path = require('path');
const { indexVault } = require('../lib/rag/vectorStore');

async function main() {
  const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  console.log(`🔍 Iniciando indexação vetorial do vault em: ${targetDir}`);
  const startTime = Date.now();

  try {
    const result = await indexVault(targetDir, (current, total, file) => {
      console.log(` [${current}/${total}] Indexado: ${file}`);
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Indexação vetorial concluída em ${duration}s!`);
    console.log(`   - Arquivos processados: ${result.totalFiles}`);
    console.log(`   - Chunks vetoriais gerados: ${result.totalChunks}`);
    console.log(`   - Índice armazenado em: .obsidian/rag-index.json`);
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Erro durante a indexação vetorial: ${err.message}`);
    process.exit(1);
  }
}

main();
