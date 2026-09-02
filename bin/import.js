#!/usr/bin/env node
const path = require('path');
const { importRepository } = require('../lib/tools/import');

async function main() {
  const sourceDir = process.argv[2];
  const targetVaultDir = process.argv[3] ? path.resolve(process.argv[3]) : process.cwd();

  if (!sourceDir) {
    console.error('❌ Uso incorreto. Informe o diretório de origem a ser importado.');
    console.log('Exemplo: npx obsidian-rag-import /home/jean/MeuVaultRAG/mba-ia');
    process.exit(1);
  }

  const resolvedSource = path.resolve(sourceDir);
  console.log(`📦 Importando repositório de: ${resolvedSource}`);
  console.log(`📂 Destino no vault: ${targetVaultDir}\n`);

  try {
    const result = importRepository(resolvedSource, targetVaultDir);
    console.log(`✅ Importação concluída com sucesso!`);
    console.log(`   - Arquivos originais processados: ${result.importedFiles}`);
    console.log(`   - Notas RAG modulares geradas em references/imported/: ${result.totalNotesCreated}`);
    console.log(`\n💡 Dica: Rode 'npx obsidian-rag-index' para gerar os vetores semânticos das notas importadas!`);
    process.exit(0);
  } catch (err) {
    console.error(`❌ Erro ao importar repositório: ${err.message}`);
    process.exit(1);
  }
}

main();
