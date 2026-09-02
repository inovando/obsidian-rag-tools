const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { handleWriteNote } = require('./lib/tools/write');
const { handleQueryKnowledgeBase } = require('./lib/tools/query');
const { indexVault, loadVectorStore } = require('./lib/rag/vectorStore');

async function runTests() {
  console.log('🧪 Iniciando Testes Automatizados de Local RAG e Salvamento de Notas...\n');
  const targetDir = process.cwd();

  // Teste 1: Escrita de nota com token_density preciso e validação
  console.log('Test 1: Testando handleWriteNote (salvamento de nota)...');
  const testNotePath = '_shared/nodejs/shared-nodejs-test-rag.md';
  const testContent = `## Introdução ao Teste RAG
Esta nota é um teste automatizado de integração RAG local para verificar a busca semântica por similaridade vetorial.

## Arquitetura Assíncrona
O modelo de entrada e saída não-bloqueante permite alta concorrência em servidores Node.js através de operações orientadas a eventos.`;

  const writeResult = await handleWriteNote({
    filePath: testNotePath,
    topic: 'Node.js Test RAG',
    tags: ['_shared/nodejs', 'test'],
    sources: ['https://nodejs.org/docs'],
    content: testContent
  });

  assert.strictEqual(writeResult.success, true, 'handleWriteNote deveria ter retornado sucesso');
  console.log('  ✓ handleWriteNote criou a nota com sucesso.');

  // Teste 2: Limite de 200 linhas
  console.log('\nTest 2: Testando rejeição de notas com mais de 200 linhas...');
  const longContent = Array(205).fill('Linha repetida de teste').join('\n');
  const overLimitResult = await handleWriteNote({
    filePath: '_shared/nodejs/overlimit.md',
    topic: 'Over Limit',
    tags: ['test'],
    sources: ['https://example.com'],
    content: longContent
  });

  assert.strictEqual(overLimitResult.success, false, 'Deveria falhar ao ultrapassar 200 linhas');
  assert.ok(overLimitResult.errors.some(e => e.includes('200 lines')), 'Mensagem de erro deve conter o limite de 200 linhas');
  console.log('  ✓ Limite de 200 linhas validado corretamente.');

  // Teste 3: Indexação Vetorial Completa do Vault
  console.log('\nTest 3: Executando indexação vetorial completa do vault...');
  const indexResult = await indexVault(targetDir);
  console.log(`  ✓ Indexados ${indexResult.totalFiles} arquivos e ${indexResult.totalChunks} chunks vetoriais.`);

  const store = loadVectorStore(targetDir);
  assert.ok(store.chunks.length > 0, 'O índice vetorial deve conter chunks');

  // Teste 4: Busca Semântica Híbrida RRF
  console.log('\nTest 4: Executando busca semântica por similaridade vetorial (RRF)...');
  const searchResult = await handleQueryKnowledgeBase({
    query: 'como funciona alta concorrência e modelo assíncrono não bloqueante'
  });

  assert.ok(searchResult.results.length > 0, 'Busca deveria retornar resultados');
  const topResult = searchResult.results[0];
  console.log(`  Top match: ${topResult.filePath} (RRF Score: ${topResult.score}, Semantic: ${topResult.semanticScore}, Keyword: ${topResult.keywordScore})`);
  assert.ok(topResult.semanticScore > 0.3, 'Semantic score deve ser significativo para termos conceituais semelhantes');
  console.log('  ✓ Busca semântica vetorial validada com sucesso.');

  // Limpeza de arquivo de teste
  const fullTestPath = path.resolve(targetDir, 'references', testNotePath);
  if (fs.existsSync(fullTestPath)) fs.unlinkSync(fullTestPath);

  console.log('\n========================================');
  console.log('🎉 Todos os testes de Local RAG passaram com 100% de sucesso!');
}

runTests().catch(err => {
  console.error('\n❌ Erro durante a execução dos testes:', err);
  process.exit(1);
});
