const http = require('http');
const https = require('https');

let pipelinePromise = null;
let extractor = null;

const DEFAULT_MODEL = process.env.EMBEDDING_MODEL || 'Xenova/multilingual-e5-small';

/**
 * Helper utilitário para chamadas HTTP/HTTPS POST com payload JSON.
 */
function postJson(urlStr, headers, payloadObj, timeoutMs = 5000) {
  const url = new URL(urlStr);
  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? https : http;
  const payload = JSON.stringify(payloadObj);

  return new Promise((resolve) => {
    const req = transport.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers
      },
      timeout: timeoutMs
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(payload);
    req.end();
  });
}

/**
 * Obtém ou inicializa a pipeline de embeddings do Transformers.js (ONNX Local).
 */
async function getTransformersExtractor() {
  if (extractor) return extractor;
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      try {
        const { pipeline, env } = await import('@xenova/transformers');
        env.allowLocalModels = true;
        extractor = await pipeline('feature-extraction', DEFAULT_MODEL, {
          quantized: true,
        });
        return extractor;
      } catch (err) {
        console.warn('Aviso: Não foi possível carregar @xenova/transformers ONNX local:', err.message);
        return null;
      }
    })();
  }
  return pipelinePromise;
}

/**
 * Geração de Embeddings com Transformers.js local (ONNX / WebAssembly)
 */
async function generateLocalEmbedding(text) {
  const pipe = await getTransformersExtractor();
  if (!pipe) return null;
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/**
 * Geração de Embeddings via Ollama (http://localhost:11434/api/embeddings)
 */
async function generateOllamaEmbedding(text) {
  const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const model = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
  const parsed = await postJson(`${host}/api/embeddings`, {}, { model, prompt: text }, 3000);
  return parsed && parsed.embedding ? parsed.embedding : null;
}

/**
 * Geração de Embeddings via OpenAI API (se OPENAI_API_KEY estiver configurada)
 */
async function generateOpenAIEmbedding(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';
  const parsed = await postJson(
    'https://api.openai.com/v1/embeddings',
    { 'Authorization': `Bearer ${apiKey}` },
    { input: text, model },
    5000
  );
  return parsed && parsed.data && parsed.data[0] && parsed.data[0].embedding ? parsed.data[0].embedding : null;
}

/**
 * Função principal para gerar embeddings baseada no provedor configurado.
 * Suporta o tipo 'query' vs 'passage' para modelos da família e5.
 */
async function generateEmbedding(text, kind = 'passage') {
  if (!text || !text.trim()) return null;
  try {
    const provider = (process.env.EMBEDDING_PROVIDER || 'transformers').toLowerCase();

    // Formatação de prefixo para e5
    const isE5 = /e5-/i.test(DEFAULT_MODEL);
    const formattedText = isE5 ? `${kind === 'query' ? 'query' : 'passage'}: ${text}` : text;

    let embedding = null;
    if (provider === 'ollama') {
      embedding = await generateOllamaEmbedding(formattedText);
    } else if (provider === 'openai') {
      embedding = await generateOpenAIEmbedding(formattedText);
    }

    if (!embedding) {
      embedding = await generateLocalEmbedding(formattedText);
    }

    return embedding;
  } catch (err) {
    console.warn('Erro ao gerar embedding:', err.message);
    return null;
  }
}

module.exports = {
  generateEmbedding,
  DEFAULT_MODEL
};
