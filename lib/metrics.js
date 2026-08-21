const fs = require('fs');
const path = require('path');

const { WORKSPACE_ROOT, REFERENCES_DIR } = require('./paths');
const METRICS_PATH = path.join(WORKSPACE_ROOT, '.agents', 'mcp-metrics.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(METRICS_PATH, 'utf8'));
  } catch {
    return { totalQueries: 0, totalNotesWritten: 0, validationErrorsPrevented: 0, toolErrorCount: 0, queryLatencyMs: [], resultsCount: [], inputTokensConsumed: [] };
  }
}

function save(metrics) {
  const dir = path.dirname(METRICS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(METRICS_PATH, JSON.stringify(metrics, null, 2));
}

function recordQuery(latencyMs, resultsLength, tokens) {
  const m = load();
  m.totalQueries++;
  m.queryLatencyMs.push(latencyMs);
  m.resultsCount.push(resultsLength);
  m.inputTokensConsumed.push(tokens);
  save(m);
}

function recordWrite() {
  const m = load();
  m.totalNotesWritten++;
  save(m);
}

function recordValidationError() {
  const m = load();
  m.validationErrorsPrevented++;
  save(m);
}

function recordError() {
  const m = load();
  m.toolErrorCount++;
  save(m);
}

function getMetrics() {
  const m = load();
  const p50 = m.queryLatencyMs.length ? m.queryLatencyMs.sort((a, b) => a - b)[Math.floor(m.queryLatencyMs.length * 0.5)] : 0;
  const p95 = m.queryLatencyMs.length ? m.queryLatencyMs.sort((a, b) => a - b)[Math.floor(m.queryLatencyMs.length * 0.95)] : 0;
  const totalTokens = m.inputTokensConsumed.reduce((a, b) => a + b, 0);
  return {
    totalQueries: m.totalQueries,
    totalNotesWritten: m.totalNotesWritten,
    validationErrorsPrevented: m.validationErrorsPrevented,
    toolErrorCount: m.toolErrorCount,
    avgLatencyMs: m.queryLatencyMs.length ? Math.round(m.queryLatencyMs.reduce((a, b) => a + b, 0) / m.queryLatencyMs.length) : 0,
    p50LatencyMs: p50,
    p95LatencyMs: p95,
    totalInputTokens: totalTokens,
    vaultSizeTokens: estimateVaultTokens(),
    recentResults: m.resultsCount.slice(-5),
  };
}

function estimateVaultTokens() {
  const refDir = REFERENCES_DIR;
  if (!fs.existsSync(refDir)) return 0;
  let total = 0;
  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) total += fs.readFileSync(p, 'utf8').length;
    }
  }
  walk(refDir);
  return Math.round(total / 4);
}

module.exports = { recordQuery, recordWrite, recordValidationError, recordError, getMetrics };
