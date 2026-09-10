const fs = require('fs');
const path = require('path');
const { generateEmbedding, DEFAULT_MODEL } = require('./embeddings');
const { chunkNote } = require('./chunker');

const INDEX_FILE_NAME = path.join('.obsidian', 'rag-index.json');

/**
 * Calcula a similaridade de cosseno entre dois vetores de números.
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  const len = vecA.length;
  for (let i = 0; i < len; i++) {
    const a = vecA[i];
    const b = vecB[i];
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function normalizeRelPath(relFilePath) {
  let clean = relFilePath.replace(/\\/g, '/');
  if (clean.startsWith('references/')) {
    clean = clean.slice('references/'.length);
  }
  return clean;
}

/**
 * Carrega o índice vetorial do arquivo local .obsidian/rag-index.json
 */
function loadVectorStore(targetDir) {
  const indexPath = path.join(targetDir, INDEX_FILE_NAME);
  if (!fs.existsSync(indexPath)) return { version: '1.0.0', model: DEFAULT_MODEL, updatedAt: null, chunks: [] };
  try {
    const raw = fs.readFileSync(indexPath, 'utf8');
    const data = JSON.parse(raw);

    // Guarda de Segurança (R2): Trata índices legados sem o campo 'model' como incompatíveis
    const indexModel = data.model || null;
    if (data.chunks && data.chunks.length > 0 && indexModel !== DEFAULT_MODEL) {
      console.warn(indexModel
        ? `⚠️ ALERTA: O índice vetorial atual usa o modelo '${indexModel}', mas o modelo ativo é '${DEFAULT_MODEL}'. Execute 'obsidian-rag-index' para reindexar o vault.`
        : `⚠️ ALERTA: O índice vetorial não possui registro de modelo (gerado por versão anterior). O modelo padrão mudou para '${DEFAULT_MODEL}' — execute 'obsidian-rag-index' para reindexar o vault.`
      );
    }

    return data;
  } catch (e) {
    return { version: '1.0.0', model: DEFAULT_MODEL, updatedAt: null, chunks: [] };
  }
}

/**
 * Salva o índice vetorial em .obsidian/rag-index.json registrando o modelo utilizado
 */
function saveVectorStore(targetDir, storeData) {
  const obsidianDir = path.join(targetDir, '.obsidian');
  if (!fs.existsSync(obsidianDir)) {
    fs.mkdirSync(obsidianDir, { recursive: true });
  }
  const indexPath = path.join(targetDir, INDEX_FILE_NAME);
  storeData.model = DEFAULT_MODEL;
  storeData.updatedAt = new Date().toISOString();
  fs.writeFileSync(indexPath, JSON.stringify(storeData, null, 2), 'utf8');
}

const yaml = require('js-yaml');

/**
 * Auto-repara o frontmatter de notas gravadas direto no disco:
 * Injeta token_density e last_updated se ausentes ou desatualizados.
 */
function autoRepairFrontmatter(absPath, stat) {
  try {
    const raw = fs.readFileSync(absPath, 'utf8');
    const lines = raw.split(/\r?\n/);
    if (!lines[0] || lines[0].trim() !== '---') return raw;

    const endIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (endIdx === -1) return raw;

    const fmText = lines.slice(1, endIdx).join('\n');
    let fm = {};
    try {
      fm = yaml.load(fmText) || {};
    } catch {
      return raw;
    }

    let modified = false;

    if (!fm.last_updated) {
      fm.last_updated = (stat && stat.mtime ? new Date(stat.mtime) : new Date()).toISOString();
      modified = true;
    }

    const bodyLines = lines.slice(endIdx + 1);
    const bodyStr = bodyLines.join('\n');
    const actualLines = lines.length;
    const currentTd = fm.token_density || {};

    if (currentTd.line_count !== actualLines || !currentTd.character_count) {
      modified = true;
    }

    if (!modified) return raw;

    fm.token_density = {
      line_count: actualLines,
      character_count: raw.length
    };

    let newFmText = yaml.dump(fm).trim();
    let newFullContent = `---\n${newFmText}\n---\n${bodyStr}`;

    fm.token_density.character_count = newFullContent.length;
    newFmText = yaml.dump(fm).trim();
    newFullContent = `---\n${newFmText}\n---\n${bodyStr}`;

    fs.writeFileSync(absPath, newFullContent, 'utf8');
    return newFullContent;
  } catch {
    return null;
  }
}

/**
 * Sincroniza o índice vetorial com o sistema de arquivos:
 * 1. Detecta notas novas em disco ausentes do índice.
 * 2. Detecta notas modificadas após o último timestamp do índice.
 * 3. Purga chunks de notas excluídas do disco.
 */
async function syncIndexWithDisk(targetDir) {
  const referencesDir = path.join(targetDir, 'references');
  if (!fs.existsSync(referencesDir)) {
    return { syncedCount: 0, updatedFiles: [], purgedFiles: [] };
  }

  const store = loadVectorStore(targetDir);
  const indexTime = store.updatedAt ? new Date(store.updatedAt).getTime() : 0;

  // Escaneia arquivos .md em disco
  const diskFilesMap = new Map(); // relPath -> { absPath, mtimeMs }
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== '.git' && entry.name !== 'node_modules') {
        scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const relPath = normalizeRelPath(path.relative(referencesDir, fullPath));
        const stat = fs.statSync(fullPath);
        diskFilesMap.set(relPath, { absPath: fullPath, mtimeMs: stat.mtimeMs, stat });
      }
    }
  }
  scan(referencesDir);

  // Identifica arquivos já indexados
  const indexedFilesSet = new Set();
  (store.chunks || []).forEach(c => indexedFilesSet.add(normalizeRelPath(c.filePath)));

  // 1. Identifica arquivos a atualizar (ausentes do índice ou com mtime > indexTime)
  const filesToUpdate = [];
  for (const [relPath, info] of diskFilesMap.entries()) {
    const isMissing = !indexedFilesSet.has(relPath);
    const isModified = indexTime > 0 && info.mtimeMs > (indexTime + 1000); // 1s buffer
    if (isMissing || isModified) {
      filesToUpdate.push({ relPath, absPath: info.absPath, stat: info.stat });
    }
  }

  // 2. Identifica chunks de arquivos excluídos
  const purgedFiles = [];
  const initialChunkCount = (store.chunks || []).length;
  store.chunks = (store.chunks || []).filter(c => {
    const relPath = normalizeRelPath(c.filePath);
    const exists = diskFilesMap.has(relPath);
    if (!exists && !purgedFiles.includes(relPath)) {
      purgedFiles.push(relPath);
    }
    return exists;
  });

  const updatedFiles = [];
  if (filesToUpdate.length > 0) {
    for (const fileObj of filesToUpdate) {
      const { relPath, absPath, stat } = fileObj;
      try {
        // Auto-repara frontmatter (token_density / last_updated)
        let content = autoRepairFrontmatter(absPath, stat);
        if (!content) content = fs.readFileSync(absPath, 'utf8');

        // Remove chunks existentes desse arquivo antes de re-chunkar
        store.chunks = store.chunks.filter(c => normalizeRelPath(c.filePath) !== relPath);

        if (content && content.trim()) {
          const chunks = chunkNote(relPath, content);
          for (const chunk of chunks) {
            const embedding = await generateEmbedding(chunk.textToEmbed, 'passage');
            if (embedding) {
              store.chunks.push({
                chunkId: chunk.chunkId,
                filePath: relPath,
                heading: chunk.heading,
                topic: chunk.topic,
                tags: chunk.tags,
                startLine: chunk.startLine,
                endLine: chunk.endLine,
                content: chunk.content,
                embedding
              });
            }
          }
        }
        updatedFiles.push(relPath);
      } catch (err) {
        console.warn(`Aviso ao auto-indexar ${relPath}: ${err.message}`);
      }
    }
  }

  const hasChanges = updatedFiles.length > 0 || purgedFiles.length > 0 || initialChunkCount !== store.chunks.length;
  if (hasChanges) {
    saveVectorStore(targetDir, store);
  }

  return {
    syncedCount: updatedFiles.length,
    updatedFiles,
    purgedFiles
  };
}

/**
 * Realiza busca semântica por similaridade de cosseno sobre os chunks indexados.
 * Garante sincronização prévia com o disco (auto-indexing).
 */
async function searchVectorStore(targetDir, queryText, topK = 10, allowedPathsSet = null) {
  // R1: Auto-sincroniza alterações no disco antes da busca
  try {
    await syncIndexWithDisk(targetDir);
  } catch (err) {
    console.warn('Aviso: Falha na auto-sincronização do disco:', err.message);
  }

  const store = loadVectorStore(targetDir);
  if (!store.chunks || store.chunks.length === 0) return [];

  const queryEmbedding = await generateEmbedding(queryText, 'query');
  if (!queryEmbedding) return [];

  const referencesDir = path.join(targetDir, 'references');

  // Purga dinâmica de chunks órfãos (arquivos inexistentes em disco)
  let chunksToSearch = store.chunks.filter(chunk => {
    const cleanPath = normalizeRelPath(chunk.filePath);
    const absPath = path.resolve(referencesDir, cleanPath);
    return fs.existsSync(absPath);
  });

  if (allowedPathsSet && allowedPathsSet instanceof Set && allowedPathsSet.size > 0) {
    chunksToSearch = chunksToSearch.filter(chunk => allowedPathsSet.has(normalizeRelPath(chunk.filePath)));
  }

  const scored = chunksToSearch.map(chunk => {
    const sim = cosineSimilarity(queryEmbedding, chunk.embedding);
    return {
      chunk,
      semanticScore: sim
    };
  });

  scored.sort((a, b) => b.semanticScore - a.semanticScore);
  return scored.slice(0, topK);
}

/**
 * Atualiza incrementalmente uma única nota no índice vetorial com kind = 'passage'.
 */
async function updateNoteInIndex(targetDir, relFilePath, content) {
  try {
    const store = loadVectorStore(targetDir);
    const cleanRelPath = normalizeRelPath(relFilePath);
    const referencesDir = path.join(targetDir, 'references');

    // Remove chunks antigos do arquivo cleanRelPath e expurga órfãos cujo arquivo não existe mais
    store.chunks = store.chunks.filter(c => {
      const cPath = normalizeRelPath(c.filePath);
      if (cPath === cleanRelPath) return false;
      const absPath = path.resolve(referencesDir, cPath);
      return fs.existsSync(absPath);
    });

    if (content && content.trim()) {
      const chunks = chunkNote(cleanRelPath, content);
      for (const chunk of chunks) {
        const embedding = await generateEmbedding(chunk.textToEmbed, 'passage');
        if (embedding) {
          store.chunks.push({
            chunkId: chunk.chunkId,
            filePath: cleanRelPath,
            heading: chunk.heading,
            topic: chunk.topic,
            tags: chunk.tags,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            content: chunk.content,
            embedding
          });
        }
      }
    }
    saveVectorStore(targetDir, store);
    return { success: true, chunksCount: store.chunks.length };
  } catch (err) {
    console.error('Erro na atualização incremental do índice vetorial:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Indexação completa do vault com kind = 'passage'.
 */
async function indexVault(targetDir, onProgress) {
  const referencesDir = path.join(targetDir, 'references');
  if (!fs.existsSync(referencesDir)) {
    throw new Error('Diretório de referências não encontrado: ' + referencesDir);
  }

  const markdownFiles = [];
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== '.git' && entry.name !== 'node_modules') {
        scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        markdownFiles.push(fullPath);
      }
    }
  }
  scan(referencesDir);

  const allChunks = [];
  let totalIndexed = 0;

  for (const filePath of markdownFiles) {
    const relFilePath = normalizeRelPath(path.relative(referencesDir, filePath));
    const content = fs.readFileSync(filePath, 'utf8');
    const chunks = chunkNote(relFilePath, content);

    for (const chunk of chunks) {
      const embedding = await generateEmbedding(chunk.textToEmbed, 'passage');
      if (embedding) {
        allChunks.push({
          chunkId: chunk.chunkId,
          filePath: relFilePath,
          heading: chunk.heading,
          topic: chunk.topic,
          tags: chunk.tags,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          content: chunk.content,
          embedding
        });
      }
    }

    totalIndexed++;
    if (onProgress) onProgress(totalIndexed, markdownFiles.length, relFilePath);
  }

  const storeData = {
    version: '1.0.0',
    model: DEFAULT_MODEL,
    updatedAt: new Date().toISOString(),
    chunks: allChunks
  };

  saveVectorStore(targetDir, storeData);
  return { totalFiles: totalIndexed, totalChunks: allChunks.length };
}

module.exports = {
  loadVectorStore,
  saveVectorStore,
  searchVectorStore,
  updateNoteInIndex,
  syncIndexWithDisk,
  indexVault,
  cosineSimilarity,
  normalizeRelPath
};
