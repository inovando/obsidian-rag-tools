const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function isValidISODate(dateStr) {
  if (typeof dateStr !== 'string') return false;
  const basicDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const dateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
  if (!basicDateRegex.test(dateStr) && !dateTimeRegex.test(dateStr)) {
    return false;
  }
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

function isSkippedFile(filePath, targetDir) {
  const rel = path.relative(targetDir, filePath);
  const parts = rel.split(path.sep);
  if (parts[0] === 'example-nextjs-adonis') return true;
  if (parts.length === 1 && !rel.startsWith('references') && !rel.startsWith('llm_context') && !rel.startsWith('templates')) return true;
  if (parts[0] === 'templates' && rel === path.join('templates', 'note_template.md')) return true;
  return false;
}

function isTechNote(filePath, targetDir) {
  const rel = path.relative(targetDir, filePath);
  const parts = rel.split(path.sep);
  return parts[0] === 'references' && path.basename(filePath) !== '_index.md' && path.basename(filePath) !== '_project.md';
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
  const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  
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
    // Stat failed, meaning directory is missing
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
      // Ignore directory read errors for scan, we will handle file reads gracefully later
      return;
    }
    for (const entry of entries) {
      const fullPath = path.resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === '.temp_vaults' || entry.name === '.agents' || entry.name === 'node_modules') {
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
  console.log("DEBUG: Scanned files:", mdFiles.map(f => path.relative(targetDir, f)));
  
  for (const filePath of mdFiles) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      console.error("Error reading file");
      console.error("Permission denied");
      allErrors[filePath] = ["Error reading file: Permission denied"];
      continue;
    }
    
    const fileErrors = [];
    const fileWarnings = [];
    
    if (content.length === 0) {
      fileErrors.push("Empty file");
      fileErrors.push("Missing YAML frontmatter");
      allErrors[filePath] = fileErrors;
      continue;
    }
    
    const lines = content.split(/\r?\n/);
    
    if (lines[0].replace(/\r$/, '') !== '---') {
      fileErrors.push("Missing YAML frontmatter");
      allErrors[filePath] = fileErrors;
      continue;
    }
    
    const closingIndex = lines.findIndex((line, idx) => idx > 0 && line.replace(/\r$/, '') === '---');
    if (closingIndex === -1) {
      fileErrors.push("Missing YAML frontmatter");
      allErrors[filePath] = fileErrors;
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
    
    // verified_by_reviewer field
    if (fm.verified_by_reviewer === undefined) {
      fileErrors.push("Missing required field: verified_by_reviewer");
    } else if (typeof fm.verified_by_reviewer !== 'boolean') {
      fileErrors.push("verified_by_reviewer must be a boolean");
    } else if (fm.verified_by_reviewer === false) {
      if (isTechNote(filePath, targetDir)) {
        fileErrors.push("Note is not verified by reviewer");
      } else {
        fileWarnings.push("Note is not verified by reviewer (pending human review)");
      }
    }
    
    // last_updated field
    if (fm.last_updated === undefined) {
      fileErrors.push("Missing required field: last_updated");
    } else if (typeof fm.last_updated !== 'string' || !isValidISODate(fm.last_updated)) {
      fileErrors.push("last_updated must be a valid ISO-8601 date");
    }
    
    // token_density field
    if (fm.token_density === undefined) {
      fileErrors.push("Missing required field: token_density");
    } else {
      const td = fm.token_density;
      const actualLineCount = lines.length;
      const actualCharCount = content.length;
      if (typeof td !== 'object' || td === null || td.line_count === undefined || td.character_count === undefined) {
        fileErrors.push("Token density line_count mismatch");
      } else {
        if (td.line_count !== actualLineCount) {
          fileErrors.push("Token density line_count mismatch");
        }
        if (td.character_count !== actualCharCount) {
          fileErrors.push("Token density character_count mismatch");
        }
      }
    }
    
    // File line limit constraint
    if (lines.length > 200) {
      fileErrors.push("exceeds line limit of 200");
    }
    
    const bodyLines = lines.slice(closingIndex + 1);
    const bodyText = bodyLines.join('\n');
    
    // Placeholder checks
    if (/(?<![a-zA-Z0-9À-ÿ])TODO(?![a-zA-Z0-9À-ÿ])/i.test(bodyText)) {
      fileErrors.push("contains placeholder: 'TODO'");
    }
    if (/(?<![a-zA-Z0-9À-ÿ])TBD(?![a-zA-Z0-9À-ÿ])/i.test(bodyText)) {
      fileErrors.push("contains placeholder: 'TBD'");
    }
    
    // Clean code blocks to ignore links inside them
    const cleanBodyText = bodyText.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*?`/g, '');
    
    // Wiki links and Image embeds
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
          
          // Strategy 1: relative to source file (standard markdown)
          const relResolved = path.resolve(path.dirname(filePath), targetFile);
          if (referencesFiles.has(relResolved)) {
            foundPath = relResolved;
          } else if (referencesLowerMap.has(relResolved.toLowerCase())) {
            foundPath = referencesLowerMap.get(relResolved.toLowerCase());
            isCaseMismatch = true;
          }
          
          // Strategy 2: relative to vault root (Obsidian standard for wiki-links with path)
          // Obsidian resolves [[_shared/nodejs/event_loop]] from vault root, not from file location
          if (!foundPath && target.includes('/')) {
            // Try from references/ directory (most wiki-links use paths under references/)
            const fromRefsRoot = path.resolve(referencesDirResolved, targetFile);
            if (referencesFiles.has(fromRefsRoot)) {
              foundPath = fromRefsRoot;
            } else if (referencesLowerMap.has(fromRefsRoot.toLowerCase())) {
              foundPath = referencesLowerMap.get(fromRefsRoot.toLowerCase());
              isCaseMismatch = true;
            }
            // Try from vault root directly
            if (!foundPath) {
              const fromVaultRoot = path.resolve(targetDir, targetFile);
              if (vaultFiles.has(fromVaultRoot)) {
                foundPath = fromVaultRoot;
              }
            }
          }
          
          // Strategy 3: basename match (no path separators)
          if (!foundPath && !target.includes('/') && !target.includes('\\')) {
            if (referencesBasenameMap.has(targetFile)) {
              foundPath = referencesBasenameMap.get(targetFile)[0];
            } else if (referencesBasenameLowerMap.has(targetFile.toLowerCase())) {
              foundPath = referencesBasenameLowerMap.get(targetFile.toLowerCase())[0];
              isCaseMismatch = true;
            }
          }
          
          if (!foundPath) {
            if (isTechNote(filePath, targetDir)) {
              fileErrors.push("Broken wiki-link: [[" + target + "]]");
            } else {
              fileWarnings.push("Wiki-link target not found (may be created later): [[" + target + "]]");
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
          fileErrors.push("Broken markdown link: " + targetPath);
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
  for (const [file, fileWarnings] of Object.entries(allWarnings)) {
    if (fileWarnings.length > 0) {
      totalWarnings += fileWarnings.length;
      console.warn(`File: ${path.relative(targetDir, file)}`);
      for (const warn of fileWarnings) {
        console.warn(`  - ${warn}`);
      }
    }
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

if (require.main === module) {
  main();
}
