const assert = require('assert');
const { handleListSkills, handleReadSkill } = require('./lib/tools/skills');
const { handleManageAgentProfile } = require('./lib/tools/agents');
const { handleGetPendingReviews } = require('./lib/tools/pending');
const { handleManageSessionMemory } = require('./lib/tools/memory');
const { handleReadNote } = require('./lib/tools/read');

async function runTests() {
  console.log('🧪 Iniciando Testes Automatizados da Suíte Avançada v1.2.0...\n');

  // Teste 1: Skills
  console.log('Test 1: Testando list_skills e read_skill...');
  const skillsRes = handleListSkills();
  assert.ok(skillsRes.skills.length > 0, 'Deve encontrar pelo menos 1 skill em .agents/skills/');
  console.log(`  ✓ Encontradas ${skillsRes.skills.length} skills (ex: ${skillsRes.skills[0].id}).`);

  const readSkillRes = handleReadSkill({ skillId: 'langchain' });
  assert.strictEqual(readSkillRes.success, true, 'Deve ler a skill langchain');
  console.log('  ✓ Leitura da skill langchain realizada com sucesso.');

  // Teste 2: Agentes Especializados
  console.log('\nTest 2: Testando manage_agent_profile (list, read, write)...');
  const agentsList = handleManageAgentProfile({ action: 'list' });
  assert.ok(agentsList.profiles.length > 0, 'Deve encontrar perfis em .agents/profiles/');
  console.log(`  ✓ Encontrados ${agentsList.profiles.length} agentes no vault.`);

  const writeAgentRes = handleManageAgentProfile({
    action: 'write',
    agentId: 'test-agent',
    role: 'Agente de Teste Automatizado',
    description: 'Agente criado durante o teste automatizado.'
  });
  assert.strictEqual(writeAgentRes.success, true, 'Deve criar agente de teste');
  console.log('  ✓ Perfil de agente criado/atualizado com sucesso.');

  // Teste 3: Pendências de Aprovação Humana (Read-Only)
  console.log('\nTest 3: Testando get_pending_reviews (100% Read-Only)...');
  const pendingRes = handleGetPendingReviews();
  console.log(`  ✓ Encontradas ${pendingRes.totalPending} notas pendentes de revisão humana.`);
  assert.strictEqual(typeof pendingRes.totalPending, 'number', 'totalPending deve ser um número');

  // Teste 4: Memória Contínua de Sessão
  console.log('\nTest 4: Testando manage_session_memory (save, get, clear)...');
  const saveMemRes = handleManageSessionMemory({
    action: 'save',
    context: 'Testando a suíte v1.2.0',
    decisions: ['Implementar Skills', 'Implementar Agentes Evolutivos'],
    nextSteps: ['Publicação manual do pacote pelo usuário']
  });
  assert.strictEqual(saveMemRes.success, true, 'Deve salvar memória de sessão');

  const getMemRes = handleManageSessionMemory({ action: 'get' });
  assert.strictEqual(getMemRes.memory.context, 'Testando a suíte v1.2.0');
  console.log('  ✓ Memória de sessão salva e recuperada com sucesso.');

  // Teste 5: Leitura por Seção (Heading) em read_note
  console.log('\nTest 5: Testando read_note com filtro por heading...');
  const readSecRes = handleReadNote({
    filePath: 'luccaro/PD-LLM-CONTEXT.md',
    heading: 'Visão Geral'
  });
  assert.strictEqual(readSecRes.success, true, 'Deve ler nota com sucesso');
  console.log('  ✓ Leitura filtrada por seção executada com economia de tokens.');

  console.log('\n========================================');
  console.log('🎉 Todos os testes avançados da v1.2.0 passaram com 100% de sucesso!');
}

runTests().catch(err => {
  console.error('\n❌ Erro nos testes:', err);
  process.exit(1);
});
