const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function isValidISODate(val) {
  if (val instanceof Date) return !isNaN(val.getTime());
  if (typeof val !== 'string') return false;
  const basicDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const dateTimeRegex = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
  if (!basicDateRegex.test(val) && !dateTimeRegex.test(val)) return false;
  const date = new Date(val);
  return !isNaN(date.getTime());
}

function isSkippedFile(filePath, targetDir) {
  const rel = path.relative(targetDir, filePath);
  const parts = rel.split(path.sep);
  
  if (parts[0] === 'example-nextjs-adonis' || parts[0] === 'docs' || parts[0] === 'doc' || parts[0] === '.github') return true;
  if (parts[0] === '.obsidian' || parts[0] === 'node_modules' || parts[0] === '.git') return true;
  
  if (parts[0] === '.agents') {
    if (parts[1] === 'skills' && filePath.endsWith('.md')) {
      return false; // Permite escanear wiki-links em skills
    }
    return true;
  }

  // Apenas arquivos dentro de referencias, llm_context e templates sao validados como notas
  if (!['references', 'llm_context', 'templates'].includes(parts[0])) {
    return true;
  }

  if (parts[0] === 'templates' && rel === path.join('templates', 'note_template.md')) return true;
  return false;
}

function checkHeadingExists(content, headingAnchor) {
  const headingTexts = [];
  const headingRegex = /^#+\s+(.+)$/gm;
  let hMatch;
  while ((hMatch = headingRegex.exec(content)) !== null) {
    headingTexts.push(hMatch[1].trim());
  }
  
  if (headingTexts.includes(headingAnchor)) return true;
  if (headingTexts.some(h => h.toLowerCase() === headingAnchor.toLowerCase())) return true;
  
  const slugify = (str) => str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const slugifiedAnchor = slugify(headingAnchor);
  if (headingTexts.some(h => slugify(h) === slugifiedAnchor)) return true;
  
  return false;
}

function main() {
  const targetDir = process.argv[2] && !process.argv[2].startsWith('--') ? path.resolve(process.argv[2]) : process.cwd();
  const isVerbose = process.argv.includes('--verbose') || process.argv.includes('-v');

  if (!fs.existsSync(targetDir)) {
    console.error("Directory does not exist");
    process.exit(1);
  }
  
  const templatesDir = path.join(targetDir, 'templates');
  const referencesDir = path.join(targetDir, 'references');
  
  let templatesStat, referencesStat;
  try {
    templatesStat = fs.statSync(templatesDir);
    referencesStat = fs.statSync(referencesDir);
  } catch (err) {
    // Stat failed
  }
  
  if (!templatesStat || !templatesStat.isDirectory() || !referencesStat || !referencesStat.isDirectory()) {
    console.error("Invalid vault structure: missing required directories");
    process.exit(1);
  }
  
  const vaultFiles = new Set();
  const vaultLowerMap = new Map();
  const vaultBasenameMap = new Map();
  
  const referencesFiles = new Set();
  const referencesLowerMap = new Map();
  const referencesBasenameMap = new Map();
  const referencesBasenameLowerMap = new Map();
  
  const referencesDirResolved = path.resolve(targetDir, 'references');
  
  function scanVault(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === '.temp_vaults' || entry.name === 'node_modules' || entry.name === '.obsidian' || entry.name === '.github') {
          continue;
        }
        scanVault(fullPath);
      } else if (entry.isFile()) {
        vaultFiles.add(fullPath);
        vaultLowerMap.set(fullPath.toLowerCase(), fullPath);
        
        const basename = entry.name;
        const basenameLower = basename.toLowerCase();
        if (!vaultBasenameMap.has(basename)) {
          vaultBasenameMap.set(basename, []);
        }
        vaultBasenameMap.get(basename).push(fullPath);
        
        if (fullPath.startsWith(referencesDirResolved + path.sep) || fullPath === referencesDirResolved) {
          referencesFiles.add(fullPath);
          referencesLowerMap.set(fullPath.toLowerCase(), fullPath);
          
          if (!referencesBasenameMap.has(basename)) {
            referencesBasenameMap.set(basename, []);
          }
          referencesBasenameMap.get(basename).push(fullPath);
          
          if (!referencesBasenameLowerMap.has(basenameLower)) {
            referencesBasenameLowerMap.set(basenameLower, []);
          }
          referencesBasenameLowerMap.get(basenameLower).push(fullPath);
        }
      }
    }
  }
  
  scanVault(targetDir);
  
  const allErrors = {};
  const allWarnings = {};
  const mdFiles = Array.from(vaultFiles).filter(f => f.endsWith('.md') && !isSkippedFile(f, targetDir));
  
  for (const filePath of mdFiles) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      console.error("Error reading file");
      allErrors[filePath] = ["Error reading file: Permission denied"];
      continue;
    }
    
    const fileErrors = [];
    const fileWarnings = [];
    const relFromTarget = path.relative(targetDir, filePath);
    const isSkillFile = relFromTarget.startsWith('.agents' + path.sep + 'skills');
    const isTemplateFile = relFromTarget.startsWith('templates');
    const isImportedOrLegacy = relFromTarget.includes('imported') || relFromTarget.includes('projetos') || relFromTarget.includes('luccaro') || relFromTarget.includes('non-technical') || relFromTarget.includes('technical');
    
    if (content.length === 0) {
      fileErrors.push("Empty file");
      if (!isSkillFile) fileErrors.push("Missing YAML frontmatter");
      allErrors[filePath] = fileErrors;
      continue;
    }
    
    const lines = content.split(/\r?\n/);
    const hasFrontmatter = lines[0] && lines[0].replace(/\r$/, '') === '---';
    const closingIndex = hasFrontmatter ? lines.findIndex((line, idx) => idx > 0 && line.replace(/\r$/, '') === '---') : -1;

    if (!isSkillFile) {
      if (!hasFrontmatter || closingIndex === -1) {
        if (isImportedOrLegacy) {
          fileWarnings.push("Missing YAML frontmatter (legacy note)");
        } else {
          fileErrors.push("Missing YAML frontmatter");
          allErrors[filePath] = fileErrors;
        }
        if (fileWarnings.length > 0) {
          allWarnings[filePath] = fileWarnings;
        }
        continue;
      }

      const fmText = lines.slice(1, closingIndex).join('\n');
      let fm = {};
      let hasSyntaxError = false;

      try {
        fm = yaml.load(fmText) || {};
      } catch (e) {
        fileErrors.push("YAML syntax error");
        fileErrors.push("Failed to parse YAML");
        hasSyntaxError = true;
      }

      if (hasSyntaxError) {
        allErrors[filePath] = fileErrors;
        continue;
      }

      // topic field
      if (fm.topic === undefined) {
        fileErrors.push("Missing required field: topic");
      } else if (typeof fm.topic !== 'string') {
        fileErrors.push("topic must be a string");
      } else if (fm.topic === "") {
        fileErrors.push("topic cannot be empty");
      }

      // tags field
      if (fm.tags === undefined) {
        fileErrors.push("Missing required field: tags");
      } else if (!Array.isArray(fm.tags)) {
        fileErrors.push("tags must be an array");
      } else if (fm.tags.length === 0) {
        fileErrors.push("tags must contain at least one tag");
      } else if (!fm.tags.every(t => typeof t === 'string')) {
        fileErrors.push("tags must only contain strings");
      }

      // sources field
      if (fm.sources === undefined) {
        fileErrors.push("Missing required field: sources");
      } else if (!Array.isArray(fm.sources)) {
        fileErrors.push("sources must be an array");
      } else if (fm.sources.length === 0) {
        fileErrors.push("sources must contain at least one source");
      } else if (!fm.sources.every(s => typeof s === 'string')) {
        fileErrors.push("sources must only contain strings");
      }

      // verified_by_reviewer field (B3: Warning para nao quebrar exit code em CI)
      if (fm.verified_by_reviewer === undefined) {
        if (isImportedOrLegacy) {
          fileWarnings.push("Missing verified_by_reviewer (legacy note defaults to false)");
        } else {
          fileErrors.push("Missing required field: verified_by_reviewer");
        }
      } else if (typeof fm.verified_by_reviewer !== 'boolean') {
        fileErrors.push("verified_by_reviewer must be a boolean");
      } else if (fm.verified_by_reviewer === false) {
        fileWarnings.push("Note is not verified by reviewer (pending human review)");
      }

      // last_updated field
      if (fm.last_updated === undefined) {
        fileErrors.push("Missing required field: last_updated");
      } else if (!isValidISODate(fm.last_updated)) {
        fileErrors.push("last_updated must be a valid ISO-8601 date");
      }

      // token_density field
      if (fm.token_density === undefined) {
        fileErrors.push("Missing required field: token_density");
      } else if (!isTemplateFile) {
        const td = fm.token_density;
        const actualLineCount = lines.length;
        const actualCharCount = content.length;
        if (typeof td !== 'object' || td === null || td.line_count === undefined || td.character_count === undefined) {
          fileErrors.push("Token density line_count mismatch");
        } else {
          if (td.line_count !== actualLineCount) {
            fileErrors.push(`Token density line_count mismatch (expected ${actualLineCount}, got ${td.line_count})`);
          }
          if (Math.abs(td.character_count - actualCharCount) > 5) {
            fileErrors.push(`Token density character_count mismatch (expected ${actualCharCount}, got ${td.character_count})`);
          }
        }
      }

      // File line limit constraint (B3: Limite de 200 linhas em notas novas, Warning em notas legadas importadas)
      if (lines.length > 200) {
        if (isImportedOrLegacy) {
          fileWarnings.push(`exceeds recommended line limit of 200 (actual: ${lines.length} lines)`);
        } else {
          fileErrors.push(`exceeds line limit of 200 (actual: ${lines.length} lines)`);
        }
      }
    }
    
    const bodyLines = closingIndex !== -1 ? lines.slice(closingIndex + 1) : lines;
    const bodyText = bodyLines.join('\n');
    
    // Placeholder checks (B3: Warning para TODO/TBD em notas importadas)
    if (!isTemplateFile) {
      if (/(?<![a-zA-Z0-9À-ÿ])TODO(?![a-zA-Z0-9À-ÿ])/i.test(bodyText)) {
        if (isImportedOrLegacy) {
          fileWarnings.push("contains placeholder: 'TODO' (imported note)");
        } else {
          fileErrors.push("contains placeholder: 'TODO'");
        }
      }
      if (/(?<![a-zA-Z0-9À-ÿ])TBD(?![a-zA-Z0-9À-ÿ])/i.test(bodyText)) {
        if (isImportedOrLegacy) {
          fileWarnings.push("contains placeholder: 'TBD' (imported note)");
        } else {
          fileErrors.push("contains placeholder: 'TBD'");
        }
      }
    }
    
    // Clean code blocks to ignore links inside them
    const cleanBodyText = bodyText.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*?`/g, '');
    
    // Wiki links and Image embeds (B8: Valida wiki-links em .agents/skills/)
    const wikiLinkRegex = /(!)?\[\[(.*?)\]\]/g;
    let match;
    while ((match = wikiLinkRegex.exec(cleanBodyText)) !== null) {
      const isImage = !!match[1];
      const linkContent = match[2].trim();
      
      if (isImage) {
        const imageTarget = linkContent;
        const relPath = path.resolve(path.dirname(filePath), imageTarget);
        let imageExists = vaultFiles.has(relPath);
        if (!imageExists) {
          if (vaultBasenameMap.has(imageTarget)) {
            imageExists = true;
          }
        }
        if (!imageExists) {
          fileErrors.push("Broken image embed: " + imageTarget);
        }
      } else {
        const pipeParts = linkContent.split('|');
        const targetAndAnchor = pipeParts[0].trim();
        
        const hashParts = targetAndAnchor.split('#');
        const target = hashParts[0].trim();
        const headingAnchor = hashParts[1] ? hashParts[1].trim() : null;
        
        if (target === '') {
          if (headingAnchor) {
            const headingExists = checkHeadingExists(content, headingAnchor);
            if (!headingExists) {
              fileErrors.push("Broken heading reference '" + headingAnchor + "' in target '" + path.basename(filePath) + "'");
            }
          }
        } else {
          const targetFile = target.endsWith('.md') ? target : target + '.md';
          let foundPath = null;
          let isCaseMismatch = false;
          
          const relResolved = path.resolve(path.dirname(filePath), targetFile);
          if (referencesFiles.has(relResolved)) {
            foundPath = relResolved;
          } else if (referencesLowerMap.has(relResolved.toLowerCase())) {
            foundPath = referencesLowerMap.get(relResolved.toLowerCase());
            isCaseMismatch = true;
          }
          
          if (!foundPath && target.includes('/')) {
            const fromRefsRoot = path.resolve(referencesDirResolved, targetFile);
            if (referencesFiles.has(fromRefsRoot)) {
              foundPath = fromRefsRoot;
            } else if (referencesLowerMap.has(fromRefsRoot.toLowerCase())) {
              foundPath = referencesLowerMap.get(fromRefsRoot.toLowerCase());
              isCaseMismatch = true;
            }
            if (!foundPath) {
              const fromVaultRoot = path.resolve(targetDir, targetFile);
              if (vaultFiles.has(fromVaultRoot)) {
                foundPath = fromVaultRoot;
              }
            }
          }
          
          if (!foundPath && !target.includes('/') && !target.includes('\\')) {
            if (referencesBasenameMap.has(targetFile)) {
              foundPath = referencesBasenameMap.get(targetFile)[0];
            } else if (referencesBasenameLowerMap.has(targetFile.toLowerCase())) {
              foundPath = referencesBasenameLowerMap.get(targetFile.toLowerCase())[0];
              isCaseMismatch = true;
            }
          }
          
          if (!foundPath) {
            if (isTemplateFile || isImportedOrLegacy) {
              fileWarnings.push("Wiki-link target not found (example link): [[" + target + "]]");
            } else {
              fileErrors.push("Broken wiki-link: [[" + target + "]]");
            }
          } else {
            if (isCaseMismatch) {
              fileErrors.push("Case mismatch: [[" + target + "]]");
            }
            if (headingAnchor) {
              let targetContent = '';
              try {
                targetContent = fs.readFileSync(foundPath, 'utf8');
              } catch (e) {
                // Ignore
              }
              const headingExists = checkHeadingExists(targetContent, headingAnchor);
              if (!headingExists) {
                fileErrors.push("Broken heading reference '" + headingAnchor + "' in target '" + path.basename(foundPath) + "'");
              }
            }
          }
        }
      }
    }
    
    // Markdown links
    const mdLinkRegex = /(!)?\[([^\]]*?)\]\(([^)]*?)\)/g;
    let mdMatch;
    while ((mdMatch = mdLinkRegex.exec(cleanBodyText)) !== null) {
      const isImage = !!mdMatch[1];
      if (isImage) continue;
      
      const linkUrl = mdMatch[3].trim();
      if (linkUrl.startsWith('http://') || linkUrl.startsWith('https://')) {
        continue;
      }
      
      const hashIdx = linkUrl.indexOf('#');
      const targetPath = hashIdx !== -1 ? linkUrl.slice(0, hashIdx) : linkUrl;
      const headingAnchor = hashIdx !== -1 ? linkUrl.slice(hashIdx + 1) : null;
      
      const decodedTargetPath = decodeURIComponent(targetPath);
      
      if (decodedTargetPath === '') {
        if (headingAnchor) {
          const headingExists = checkHeadingExists(content, headingAnchor);
          if (!headingExists) {
            fileErrors.push("Broken heading reference '" + headingAnchor + "' in target '" + path.basename(filePath) + "'");
          }
        }
      } else {
        const resolvedPath = path.resolve(path.dirname(filePath), decodedTargetPath);
        const fileExistsCaseSensitively = vaultFiles.has(resolvedPath);
        
        if (!fileExistsCaseSensitively) {
          if (isTemplateFile || isImportedOrLegacy) {
            fileWarnings.push("Markdown link target not found (example link): " + targetPath);
          } else {
            fileErrors.push("Broken markdown link: " + targetPath);
          }
        } else {
          if (headingAnchor) {
            let targetContent = '';
            try {
              targetContent = fs.readFileSync(resolvedPath, 'utf8');
            } catch (e) {
              // Ignore
            }
            const headingExists = checkHeadingExists(targetContent, headingAnchor);
            if (!headingExists) {
              fileErrors.push("Broken heading reference '" + headingAnchor + "' in target '" + path.basename(resolvedPath) + "'");
            }
          }
        }
      }
    }
    
    if (fileErrors.length > 0) {
      allErrors[filePath] = fileErrors;
    }
    if (fileWarnings.length > 0) {
      allWarnings[filePath] = fileWarnings;
    }
  }
  
  let totalErrors = 0;
  for (const [file, fileErrors] of Object.entries(allErrors)) {
    if (fileErrors.length > 0) {
      totalErrors += fileErrors.length;
      console.error(`File: ${path.relative(targetDir, file)}`);
      for (const err of fileErrors) {
        console.error(`  - ${err}`);
      }
    }
  }
  
  let totalWarnings = 0;
  const warningCounts = {};
  const warningsByFolder = {};

  for (const [file, fileWarnings] of Object.entries(allWarnings)) {
    if (fileWarnings.length > 0) {
      totalWarnings += fileWarnings.length;
      const relPath = path.relative(targetDir, file);
      const folder = relPath.includes(path.sep) ? relPath.split(path.sep)[0] : 'raiz';
      
      warningsByFolder[folder] = (warningsByFolder[folder] || 0) + fileWarnings.length;
      for (const warn of fileWarnings) {
        warningCounts[warn] = (warningCounts[warn] || 0) + 1;
      }

      if (isVerbose) {
        console.log(`File: ${relPath}`);
        for (const warn of fileWarnings) {
          console.log(`  - Warning: ${warn}`);
        }
      }
    }
  }

  if (!isVerbose && totalWarnings > 0) {
    console.log(`\n--- Warnings Summary (${totalWarnings} total) ---`);
    console.log("By Folder:");
    for (const [folder, count] of Object.entries(warningsByFolder)) {
      console.log(`  - ${folder}/: ${count} warnings`);
    }
    console.log("By Category:");
    for (const [warn, count] of Object.entries(warningCounts)) {
      console.log(`  - ${count}x ${warn}`);
    }
    console.log("(Pass --verbose flag to list all individual file warnings)");
  }
  
  console.log(`\nValidation complete: ${totalErrors} errors, ${totalWarnings} warnings`);
  
  if (totalErrors > 0) {
    process.exit(1);
  } else {
    console.log("0 errors found");
    console.log("validation passed");
    process.exit(0);
  }
}

module.exports = { main };
if (require.main === module) {
  main();
}
