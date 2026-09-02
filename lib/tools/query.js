const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { recordQuery } = require('../metrics');
const { REFERENCES_DIR } = require('../paths');
const { searchVectorStore, normalizeRelPath } = require('../rag/vectorStore');

function getAllNotes() {
  const notes = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) {
        const content = fs.readFileSync(p, 'utf8');
        const relPath = normalizeRelPath(path.relative(REFERENCES_DIR, p));
        const fm = extractFrontmatter(content);
        if (fm && fm.topic) {
          notes.push({ filePath: relPath, content, frontmatter: fm, fullPath: p });
        }
      }
    }
  }
  walk(REFERENCES_DIR);
  return notes;
}

function extractFrontmatter(content) {
  const lines = content.split('\n');
  if (lines[0].trim() !== '---') return {};
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end === -1) return {};
  try {
    return yaml.load(lines.slice(1, end).join('\n')) || {};
  } catch {
    return {};
  }
}

function scoreNoteKeyword(note, query, tags, topic) {
  let score = 0;
  const fm = note.frontmatter;
  const lowerQuery = query ? query.toLowerCase() : '';

  if (tags && Array.isArray(tags) && tags.length > 0) {
    const noteTags = (fm.tags || []).map(t => typeof t === 'string' ? t.toLowerCase() : '');
    for (const tag of tags) {
      if (noteTags.includes(tag.toLowerCase())) score += 20;
      if (noteTags.some(t => t.includes(tag.toLowerCase()))) score += 5;
    }
  }

  if (topic) {
    const noteTopic = (fm.topic || '').toLowerCase();
    if (noteTopic === topic.toLowerCase()) score += 30;
    if (noteTopic.includes(topic.toLowerCase())) score += 10;
  }

  if (lowerQuery) {
    const body = note.content.toLowerCase();
    const queryWords = lowerQuery.split(/\s+/).filter(Boolean);
    for (const word of queryWords) {
      const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const count = (body.match(regex) || []).length;
      score += count;
    }
    const exactPhrases = lowerQuery.match(/"([^"]+)"/g);
    if (exactPhrases) {
      for (const phrase of exactPhrases) {
        if (body.includes(phrase.slice(1, -1))) score += 15;
      }
    }
  }

  return score;
}

async function handleQueryKnowledgeBase(args) {
  const startTime = Date.now();
  const query = (args.query || '').trim();
  const tags = args.tags || [];
  const topic = (args.topic || '').trim();

  const notes = getAllNotes();
  const targetDir = path.resolve(REFERENCES_DIR, '..');

  // 1. Ranking de Palavras-Chave (Keyword)
  const keywordScored = notes
    .map(n => ({ note: n, score: scoreNoteKeyword(n, query, tags, topic) }))
    .filter(n => n.score > 0)
    .sort((a, b) => b.score - a.score);

  const keywordRanks = new Map();
  keywordScored.forEach((item, idx) => {
    keywordRanks.set(normalizeRelPath(item.note.filePath), { rank: idx + 1, score: item.score, note: item.note });
  });

  // 2. Ranking Vetorial Semântico
  let vectorResults = [];
  if (query) {
    try {
      vectorResults = await searchVectorStore(targetDir, query, 10);
    } catch (e) {
      vectorResults = [];
    }
  }

  const vectorRanks = new Map();
  vectorResults.forEach((item, idx) => {
    let fileKey = normalizeRelPath(item.chunk.filePath);
    if (!vectorRanks.has(fileKey)) {
      vectorRanks.set(fileKey, { rank: idx + 1, score: item.semanticScore, chunk: item.chunk });
    }
  });

  // 3. Reciprocal Rank Fusion (RRF)
  const combinedMap = new Map();
  const K = 60;

  // Unir todas as notas encontradas no keyword ou no vector
  const allFilePaths = new Set([...keywordRanks.keys(), ...vectorRanks.keys()]);

  allFilePaths.forEach(filePath => {
    const kw = keywordRanks.get(filePath);
    const vec = vectorRanks.get(filePath);

    const rrfKw = kw ? 1 / (K + kw.rank) : 0;
    const rrfVec = vec ? 1 / (K + vec.rank) : 0;
    const rrfScore = rrfKw + rrfVec;

    // Localizar a nota
    const noteObj = notes.find(n => normalizeRelPath(n.filePath) === filePath);

    if (noteObj) {
      combinedMap.set(filePath, {
        filePath,
        frontmatter: noteObj.frontmatter,
        content: noteObj.content,
        keywordScore: kw ? kw.score : 0,
        semanticScore: vec ? vec.score : 0,
        rrfScore,
        matchedChunk: vec ? vec.chunk.content : null
      });
    }
  });

  const finalSorted = Array.from(combinedMap.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, 5);

  const results = finalSorted.map(s => {
    const fm = s.frontmatter;
    const body = s.content;
    const fmEnd = body.indexOf('---', body.indexOf('---') + 1);
    const bodyText = fmEnd !== -1 ? body.slice(fmEnd + 3).trim() : body;

    let excerpt = s.matchedChunk || bodyText;
    if (excerpt.length > 600) excerpt = excerpt.slice(0, 600) + '...';

    return {
      filePath: s.filePath,
      score: Math.round(s.rrfScore * 1000) / 1000,
      keywordScore: s.keywordScore,
      semanticScore: Math.round(s.semanticScore * 1000) / 1000,
      frontmatter: fm,
      excerpt
    };
  });

  const latency = Date.now() - startTime;
  const tokens = Math.round((query.length + JSON.stringify(tags).length + topic.length) / 4);
  recordQuery(latency, results.length, tokens);

  return { results };
}

module.exports = { handleQueryKnowledgeBase };
