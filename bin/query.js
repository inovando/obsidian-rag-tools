#!/usr/bin/env node
const { handleQueryKnowledgeBase } = require('../lib/tools/query');

async function main() {
  const queryStr = process.argv.slice(2).join(' ').trim();

  if (!queryStr) {
    console.error('❌ Por favor, digite sua consulta entre aspas.');
    console.log('Exemplo: npx obsidian-rag-query "como funciona a sintaxe LCEL no LangChain"');
    process.exit(1);
  }

  console.log(`🔎 Realizando busca semântica para: "${queryStr}"...\n`);
  const startTime = Date.now();

  try {
    const res = await handleQueryKnowledgeBase({ query: queryStr });
    const duration = Date.now() - startTime;

    if (!res.results || res.results.length === 0) {
      console.log('⚠️ Nenhuma nota encontrada para os critérios informados.');
      process.exit(0);
    }

    console.log(`✅ ${res.results.length} notas encontradas em ${duration}ms:\n`);
    res.results.forEach((r, idx) => {
      console.log(`--------------------------------------------------`);
      console.log(`[${idx + 1}] 📌 Nota: ${r.filePath}`);
      console.log(`    ⭐ Score RRF: ${r.score} | 🧠 Semântico: ${r.semanticScore} | 🔤 Keyword: ${r.keywordScore}`);
      console.log(`    🏷️ Tópico: ${r.frontmatter.topic || 'N/A'} | Tags: ${(r.frontmatter.tags || []).join(', ')}`);
      console.log(`\n    Trecho:\n${r.excerpt.slice(0, 300)}...\n`);
    });

    process.exit(0);
  } catch (err) {
    console.error(`❌ Erro ao realizar busca: ${err.message}`);
    process.exit(1);
  }
}

main();
