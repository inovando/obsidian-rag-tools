const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { recordQuery } = require('../metrics');
const { REFERENCES_DIR } = require('../paths');
const { searchVectorStore, normalizeRelPath } = require('../rag/vectorStore');

const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'com', 'em', 'no', 'na', 'nos', 'nas',
  'a', 'o', 'as', 'os', 'e', 'ou', 'para', 'por', 'que', 'como', 'um', 'uma',
  'uns', 'umas', 'se', 'seu', 'sua', 'seus', 'suas', 'mais', 'menos',
  'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'of'
]);

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

/**
 * Pré-filtro estrito por tags e tópicos (B7 & N1)
 */
function filterNotes(notes, tags, topic) {
  const hasTags = tags && Array.isArray(tags) && tags.length > 0;
  const hasTopic = topic && typeof topic === 'string' && topic.trim().length > 0;

  if (!hasTags && !hasTopic) return notes;

  return notes.filter(n => {
    const fm = n.frontmatter || {};

    if (hasTags) {
      const noteTags = (fm.tags || []).map(t => typeof t === 'string' ? t.toLowerCase() : '');
      const hasMatchingTag = tags.some(reqTag => {
        const lowerReq = reqTag.toLowerCase().trim();
        return noteTags.some(t => t === lowerReq || t.includes(lowerReq));
      });
      if (!hasMatchingTag) return false;
    }

    if (hasTopic) {
      const noteTopic = (fm.topic || '').toLowerCase();
      const reqTopic = topic.toLowerCase().trim();
      if (!noteTopic.includes(reqTopic)) return false;
    }

    return true;
  });
}

/**
 * BM25 Keyword Scoring com suporte a Underscore (N2) e Lookbehind/Lookahead Unicode para Acentos (N3)
 */
function scoreNoteBM25(note, query) {
  if (!query) return 0;
  let score = 0;
  const body = note.content.toLowerCase();
  
  // N2: Preserva underscore _ no tokenizador: [^a-z0-9_\-À-ÿ]
  const queryWords = query.toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9_\-À-ÿ]/gi, '').trim())
    .filter(w => w.length > 1 && !STOPWORDS.has(w));

  const lineCount = note.frontmatter?.token_density?.line_count || note.content.split('\n').length || 50;

  for (const word of queryWords) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // N3: Lookbehind/Lookahead Unicode sem consumir caracteres vizinhos
    const regex = new RegExp(`(?<=^|[^a-zA-Z0-9_\\u00C0-\\u00FF])${escaped}(?=$|[^a-zA-Z0-9_\\u00C0-\\u00FF])`, 'gi');
    const matches = body.match(regex);
    if (matches) {
      const count = matches.length;
      const tf = (count * 2.2) / (count + 1.2);
      score += tf / Math.log2(2 + lineCount);
    }
  }

  const exactPhrases = query.toLowerCase().match(/"([^"]+)"/g);
  if (exactPhrases) {
    for (const phrase of exactPhrases) {
      const cleanPhrase = phrase.slice(1, -1).trim();
      if (cleanPhrase && body.includes(cleanPhrase)) {
        score += 15 / Math.log2(2 + lineCount);
      }
    }
  }

  return Math.round(score * 1000) / 1000;
}

async function handleQueryKnowledgeBase(args) {
  const startTime = Date.now();
  const query = (args.query || '').trim();
  const tags = args.tags || [];
  const topic = (args.topic || '').trim();
  const compact = args.compact === true;
  const limit = Math.min(20, Math.max(1, parseInt(args.limit || 5, 10)));
  const minScore = parseFloat(args.minScore || 0);

  const hasFilter = (tags && tags.length > 0) || (topic && topic.length > 0);
  const allNotes = getAllNotes();
  const filteredNotes = filterNotes(allNotes, tags, topic);
  const targetDir = path.resolve(REFERENCES_DIR, '..');

  // Set de caminhos válidos pós-filtro (N1)
  const validPathSet = new Set(filteredNotes.map(n => normalizeRelPath(n.filePath)));

  // 1. Ranking BM25 (top 50)
  const keywordScored = filteredNotes
    .map(n => ({ note: n, score: scoreNoteBM25(n, query) }))
    .filter(n => n.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);

  const keywordRanks = new Map();
  keywordScored.forEach((item, idx) => {
    keywordRanks.set(normalizeRelPath(item.note.filePath), { rank: idx + 1, score: item.score, note: item.note });
  });

  // 2. Ranking Vetorial Semântico (N6: 150 chunks, N1: passa validPathSet se houver filtro)
  let vectorResults = [];
  if (query) {
    try {
      vectorResults = await searchVectorStore(targetDir, query, 150, hasFilter ? validPathSet : null);
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

  // 3. Reciprocal Rank Fusion (N6: K = 20)
  const combinedMap = new Map();
  const K = 20;
  const allCandidatePaths = new Set([...keywordRanks.keys(), ...vectorRanks.keys()]);

  // N1 Fallback: Se houver filtro de tag/tópico e a query zerou candidatos, inclui notas do filtro
  if (hasFilter && allCandidatePaths.size === 0) {
    filteredNotes.forEach(n => allCandidatePaths.add(normalizeRelPath(n.filePath)));
  }

  allCandidatePaths.forEach(filePath => {
    const kw = keywordRanks.get(filePath);
    const vec = vectorRanks.get(filePath);

    const rrfKw = kw ? 1 / (K + kw.rank) : 0;
    const rrfVec = vec ? 1 / (K + vec.rank) : 0;
    const rrfScore = (0.6 * rrfVec) + (0.4 * rrfKw);

    const noteObj = filteredNotes.find(n => normalizeRelPath(n.filePath) === filePath);

    if (noteObj) {
      combinedMap.set(filePath, {
        filePath,
        frontmatter: noteObj.frontmatter,
        content: noteObj.content,
        keywordScore: kw ? kw.score : 0,
        semanticScore: vec ? Math.round(vec.score * 1000) / 1000 : 0,
        rrfScore,
        matchedChunk: vec ? vec.chunk.content : null
      });
    }
  });

  const finalSorted = Array.from(combinedMap.values())
    .filter(s => s.rrfScore >= minScore)
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit);

  const results = finalSorted.map(s => {
    const fm = s.frontmatter;

    if (compact) {
      // Modo compacto otimizado para tokens: omite excerpt e simplifica frontmatter
      return {
        filePath: s.filePath,
        score: Math.round(s.rrfScore * 1000) / 1000,
        keywordScore: s.keywordScore,
        semanticScore: s.semanticScore,
        frontmatter: {
          topic: fm.topic || 'N/A',
          tags: fm.tags || []
        }
      };
    }

    const body = s.content;
    const fmEnd = body.indexOf('---', body.indexOf('---') + 1);
    const bodyText = fmEnd !== -1 ? body.slice(fmEnd + 3).trim() : body;
    let excerpt = s.matchedChunk || bodyText;
    if (excerpt.length > 600) excerpt = excerpt.slice(0, 600) + '...';

    return {
      filePath: s.filePath,
      score: Math.round(s.rrfScore * 1000) / 1000,
      keywordScore: s.keywordScore,
      semanticScore: s.semanticScore,
      frontmatter: fm,
      excerpt
    };
  });

  const latency = Date.now() - startTime;
  const payloadStr = JSON.stringify(results);
  const tokens = Math.round(payloadStr.length / 4);
  recordQuery(latency, results.length, tokens);

  return { results };
}

module.exports = { handleQueryKnowledgeBase };
