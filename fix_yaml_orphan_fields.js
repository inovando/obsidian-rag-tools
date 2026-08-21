#!/usr/bin/env node
/**
 * fix_yaml_orphan_fields.js
 * Remove sub-campos orphans (character_count/line_count sem token_density pai)
 * que ficaram fora do bloco token_density no frontmatter.
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

  if (lines[0].trim() !== '---') return false;
  const closingIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (closingIdx === -1) return false;

  const fmLines = lines.slice(1, closingIdx);
  let changed = false;

  // Find if there are orphan character_count or line_count lines
  // (indented lines with these keys that appear BEFORE the token_density: block OR outside it)
  const tdIdx = fmLines.findIndex(l => /^token_density\s*:/.test(l));

  const newFmLines = [];
  for (let i = 0; i < fmLines.length; i++) {
    const line = fmLines[i];
    // Detect orphan sub-fields: indented line with character_count or line_count
    // that are NOT inside the token_density block
    const isIndentedField = /^\s+(character_count|line_count)\s*:\s*\d+/.test(line);
    if (isIndentedField) {
      // Check if previous non-empty fm line is token_density or another sub-field of it
      const isInsideTdBlock = (function() {
        for (let j = i - 1; j >= 0; j--) {
          const prev = newFmLines[j] || fmLines[j];
          if (!prev || prev.trim() === '') continue;
          if (/^token_density\s*:/.test(prev)) return true;
          if (/^\s+(character_count|line_count)\s*:/.test(prev)) return true;
          // Hit a non-indented line that's not token_density
          return false;
        }
        return false;
      })();

      if (!isInsideTdBlock) {
        changed = true;
        console.log(`    Removing orphan: "${line.trim()}" from ${path.basename(filePath)}`);
        continue; // skip this orphan line
      }
    }
    newFmLines.push(line);
  }

  if (!changed) return false;

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
