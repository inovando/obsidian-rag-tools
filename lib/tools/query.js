const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { recordQuery } = require('../metrics');

const { REFERENCES_DIR } = require('../paths');

function getAllNotes() {
  const notes = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) {
        const content = fs.readFileSync(p, 'utf8');
        const relPath = path.relative(REFERENCES_DIR, p);
        const fm = extractFrontmatter(content);
        if (fm && fm.verified_by_reviewer === true) {
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

function scoreNote(note, query, tags, topic) {
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

function handleQueryKnowledgeBase(args) {
  const startTime = Date.now();
  const query = (args.query || '').trim();
  const tags = args.tags || [];
  const topic = (args.topic || '').trim();

  const notes = getAllNotes();

  const scored = notes
    .map(n => ({ note: n, score: scoreNote(n, query, tags, topic) }))
    .filter(n => n.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const results = scored.map(s => {
    const fm = s.note.frontmatter;
    const body = s.note.content;
    const fmEnd = body.indexOf('---', body.indexOf('---') + 1);
    const bodyText = fmEnd !== -1 ? body.slice(fmEnd + 3).trim() : body;
    const excerpt = bodyText.length > 500 ? bodyText.slice(0, 500) + '...' : bodyText;
    return {
      filePath: s.note.filePath,
      score: s.score,
      frontmatter: fm,
      excerpt,
    };
  });

  const latency = Date.now() - startTime;
  const tokens = Math.round((query.length + JSON.stringify(tags).length + topic.length) / 4);
  recordQuery(latency, results.length, tokens);

  return { results };
}

module.exports = { handleQueryKnowledgeBase };
