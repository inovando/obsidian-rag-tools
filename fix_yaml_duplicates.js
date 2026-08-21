#!/usr/bin/env node
/**
 * fix_yaml_duplicates.js
 * Corrige arquivos onde o token_density ficou duplicado:
 * - Inline format: token_density: {line_count: X, character_count: Y}
 * - Seguido de sub-campos duplicados: \n  character_count: Y\n  line_count: X
 * Remove a linha inline e mantém apenas os sub-campos.
 */
const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['.git', '.temp_vaults', '.agents', 'node_modules', '.obsidian']);

function collectMarkdownFiles(dir) {
  const results = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      results.push(...collectMarkdownFiles(path.join(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

function fixFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // Find frontmatter bounds
  if (lines[0].trim() !== '---') return false;
  const closingIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (closingIdx === -1) return false;

  const fmLines = lines.slice(1, closingIdx);

  // Detect the pattern: token_density: {line_count: X, character_count: Y}
  const inlineIdx = fmLines.findIndex(l => /^token_density\s*:\s*\{/.test(l));
  if (inlineIdx === -1) return false; // no problem here

  // Remove the inline line, keep sub-fields that follow
  const newFmLines = fmLines.filter((_, i) => i !== inlineIdx);

  // Check if we now have orphan sub-fields with correct token_density block
  // Ensure the token_density: block header exists before sub-fields
  const tdBlockIdx = newFmLines.findIndex(l => /^token_density\s*:/.test(l));
  if (tdBlockIdx === -1) {
    // Need to insert the block header before the sub-fields
    const lineCountIdx = newFmLines.findIndex(l => /^\s+line_count\s*:/.test(l));
    if (lineCountIdx !== -1) {
      newFmLines.splice(lineCountIdx, 0, 'token_density:');
    }
  }

  const newContent = ['---', ...newFmLines, ...lines.slice(closingIdx)].join('\n');
  fs.writeFileSync(filePath, newContent, 'utf8');
  return true;
}

const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const files = collectMarkdownFiles(targetDir);
let fixed = 0;
for (const f of files) {
  try {
    const wasFixed = fixFile(f);
    if (wasFixed) {
      fixed++;
      console.log(`  FIXED  ${path.relative(targetDir, f)}`);
    }
  } catch (err) {
    console.error(`  ERROR  ${path.relative(targetDir, f)}: ${err.message}`);
  }
}
console.log(`\nFixed ${fixed} files.`);
