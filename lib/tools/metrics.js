const { getMetrics } = require('../metrics');

function handleGetMcpMetrics() {
  const m = getMetrics();
  const report = [
    '===================================================',
    '  RELATÓRIO OPERACIONAL DO MCP',
    '  ===================================================',
    `  * Consultas executadas: ${m.totalQueries}`,
    `  * Notas escritas/atualizadas: ${m.totalNotesWritten}`,
    `  * Erros de validação evitados: ${m.validationErrorsPrevented}`,
    `  * Erros de ferramenta: ${m.toolErrorCount}`,
    '',
    '  ---------------------------------------------------',
    '  DESEMPENHO:',
    '  ---------------------------------------------------',
    `  * Latência média (P50): ${m.p50LatencyMs}ms`,
    `  * Latência P95: ${m.p95LatencyMs}ms`,
    `  * Total de tokens de input consumidos: ${m.totalInputTokens}`,
    `  * Tamanho total do vault: ~${m.vaultSizeTokens} tokens`,
    `  * Últimas consultas (resultados): [${m.recentResults.join(', ')}]`,
    '  ===================================================',
  ].join('\n');
  return { report, raw: m };
}

module.exports = { handleGetMcpMetrics };
