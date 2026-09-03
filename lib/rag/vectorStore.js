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

    // Guarda de Segurança: Se o modelo mudou, avisa que reindexação é necessária
    if (data.chunks && data.chunks.length > 0 && data.model && data.model !== DEFAULT_MODEL) {
      console.warn(`⚠️ ALERTA: O índice vetorial atual usa o modelo '${data.model}', mas o modelo ativo é '${DEFAULT_MODEL}'. Execute 'obsidian-rag-index' para reindexar o vault.`);
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

/**
 * Realiza busca semântica por similaridade de cosseno sobre os chunks indexados.
 * Passa kind = 'query' para o gerador de embeddings.
 */
async function searchVectorStore(targetDir, queryText, topK = 10, allowedPathsSet = null) {
  const store = loadVectorStore(targetDir);
  if (!store.chunks || store.chunks.length === 0) return [];

  const queryEmbedding = await generateEmbedding(queryText, 'query');
  if (!queryEmbedding) return [];

  let chunksToSearch = store.chunks;
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

    // Remove chunks antigos do arquivo cleanRelPath
    store.chunks = store.chunks.filter(c => normalizeRelPath(c.filePath) !== cleanRelPath);

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
  indexVault,
  cosineSimilarity,
  normalizeRelPath
};
