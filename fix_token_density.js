#!/usr/bin/env node
/**
 * fix_token_density.js
 * Recalcula token_density (line_count + character_count) em todas as notas .md do vault.
 * Atualiza o frontmatter YAML sem alterar o conteúdo da nota.
 * Usage: node fix_token_density.js [targetDir]
 */
const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['.git', '.temp_vaults', '.agents', 'node_modules', '.obsidian']);
const SKIP_FILES = new Set(['note_template.md', 'Link.md']);

function collectMarkdownFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      results.push(...collectMarkdownFiles(path.join(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      if (SKIP_FILES.has(entry.name)) continue;
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

function updateTokenDensity(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.trim()) return { skipped: true, reason: 'empty' };

  const lines = content.split(/\r?\n/);
  if (lines[0].trim() !== '---') return { skipped: true, reason: 'no frontmatter' };

  const closingIndex = lines.findIndex((line, idx) => idx > 0 && line.trim() === '---');
  if (closingIndex === -1) return { skipped: true, reason: 'unclosed frontmatter' };

  const actualLineCount = lines.length;
  const actualCharCount = content.length;

  // Parse the frontmatter block
  const fmLines = lines.slice(1, closingIndex);

  // Find token_density block and update it
  let inTokenDensity = false;
  let lineCountIdx = -1;
  let charCountIdx = -1;
  let tokenDensityIdx = -1;

  for (let i = 0; i < fmLines.length; i++) {
    const line = fmLines[i];
    if (/^token_density\s*:/.test(line)) {
      inTokenDensity = true;
      tokenDensityIdx = i;
    } else if (inTokenDensity) {
      if (/^\s+line_count\s*:/.test(line)) lineCountIdx = i;
      else if (/^\s+character_count\s*:/.test(line)) charCountIdx = i;
      else if (!/^\s/.test(line)) inTokenDensity = false; // exited the block
    }
  }

  let changed = false;
  const newFmLines = [...fmLines];

  if (tokenDensityIdx === -1) {
    // token_density block missing — add it at end of frontmatter
    newFmLines.push('token_density:');
    newFmLines.push(`  line_count: ${actualLineCount}`);
    newFmLines.push(`  character_count: ${actualCharCount}`);
    changed = true;
  } else {
    // Update existing values
    if (lineCountIdx !== -1) {
      const currentVal = parseInt(newFmLines[lineCountIdx].replace(/.*:\s*/, ''), 10);
      if (currentVal !== actualLineCount) {
        newFmLines[lineCountIdx] = `  line_count: ${actualLineCount}`;
        changed = true;
      }
    } else {
      // line_count missing inside token_density — insert after token_density line
      newFmLines.splice(tokenDensityIdx + 1, 0, `  line_count: ${actualLineCount}`);
      changed = true;
      // recalculate charCountIdx offset
      if (charCountIdx > tokenDensityIdx) charCountIdx++;
    }

    // Re-find charCountIdx after potential splice
    const updatedCharIdx = newFmLines.findIndex((l, i) => i > tokenDensityIdx && /^\s+character_count\s*:/.test(l));
    if (updatedCharIdx !== -1) {
      const currentVal = parseInt(newFmLines[updatedCharIdx].replace(/.*:\s*/, ''), 10);
      if (currentVal !== actualCharCount) {
        newFmLines[updatedCharIdx] = `  character_count: ${actualCharCount}`;
        changed = true;
      }
    } else {
      // character_count missing — insert after line_count or after token_density
      const insertAfter = lineCountIdx !== -1 ? lineCountIdx + 1 : tokenDensityIdx + 1;
      newFmLines.splice(insertAfter, 0, `  character_count: ${actualCharCount}`);
      changed = true;
    }
  }

  if (!changed) return { skipped: false, changed: false };

  // Rebuild file content
  const newContent = ['---', ...newFmLines, ...lines.slice(closingIndex)].join('\n');

  // Verify new counts will match (recalculate based on new content)
  const newLines = newContent.split(/\r?\n/);
  const newLineCount = newLines.length;
  const newCharCount = newContent.length;

  // Second pass: fix the counts if the newContent itself changed the counts
  const finalFmLines = newContent.split(/\r?\n/).slice(1, newContent.split(/\r?\n/).findIndex((l, i) => i > 0 && l.trim() === '---'));
  const finalClosingIdx = newContent.split(/\r?\n/).findIndex((l, i) => i > 0 && l.trim() === '---');
  const finalLines = newContent.split(/\r?\n/);

  // Patch the counts in the rebuilt content
  let finalContent = newContent;
  finalContent = finalContent.replace(/^(\s*line_count\s*:\s*)\d+/m, `$1${newLineCount}`);
  finalContent = finalContent.replace(/^(\s*character_count\s*:\s*)\d+/m, `$1${finalContent.length}`);

  // One more pass for char_count accuracy (it changed after the line_count patch)
  const finalCharCount = finalContent.length;
  finalContent = finalContent.replace(/^(\s*character_count\s*:\s*)\d+/m, `$1${finalCharCount}`);

  fs.writeFileSync(filePath, finalContent, 'utf8');
  return { skipped: false, changed: true, lineCount: newLineCount, charCount: finalCharCount };
}

function main() {
  const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  console.log(`Scanning: ${targetDir}`);

  const files = collectMarkdownFiles(targetDir);
  console.log(`Found ${files.length} markdown files\n`);

  let updated = 0;
  let skipped = 0;
  let unchanged = 0;
  const errors = [];

  for (const file of files) {
    const rel = path.relative(targetDir, file);
    try {
      const result = updateTokenDensity(file);
      if (result.skipped) {
        skipped++;
        console.log(`  SKIP  ${rel} (${result.reason})`);
      } else if (result.changed) {
        updated++;
        console.log(`  ✓     ${rel}`);
      } else {
        unchanged++;
      }
    } catch (err) {
      errors.push({ file: rel, error: err.message });
      console.error(`  ERROR ${rel}: ${err.message}`);
    }
  }

  console.log(`\n========================================`);
  console.log(`Updated:   ${updated}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Errors:    ${errors.length}`);
  if (errors.length > 0) process.exit(1);
  console.log('Done.');
}

main();
