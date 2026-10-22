// Embedding provider: Google Gemini over plain REST (no extra npm package).
// Groq has no embeddings endpoint, so this is the one extra API key RAG needs.
// Anything with embedDocuments(texts) + embedQuery(text) can replace this.

const axios = require('axios');

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const BATCH = 50;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// With a reduced outputDimensionality Gemini does not return unit vectors; normalise.
function normalize(v) {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

function createGeminiEmbedder({
  apiKey,
  model = process.env.EMBED_MODEL || 'gemini-embedding-001',
  dims = Number(process.env.EMBED_DIMS) || 768,
  http = axios,
  retries = 3,
} = {}) {
  if (!apiKey) throw new Error('GEMINI_API_KEY is required for embeddings');

  async function post(path, body) {
    for (let attempt = 0; ; attempt++) {
      try {
        const { data } = await http.post(`${BASE}/models/${model}:${path}`, body, {
          headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
          timeout: 20000,
        });
        return data;
      } catch (err) {
        const status = err.response?.status;
        if (attempt < retries && (status === 429 || status >= 500)) { await sleep(500 * 2 ** attempt); continue; }
        throw new Error(`embedding request failed${status ? ` (${status})` : ''}`);
      }
    }
  }

  const req = (text, taskType) => ({
    model: `models/${model}`,
    content: { parts: [{ text }] },
    taskType,
    outputDimensionality: dims,
  });

  return {
    dims,
    async embedDocuments(texts) {
      const out = [];
      for (let i = 0; i < texts.length; i += BATCH) {
        const slice = texts.slice(i, i + BATCH);
        const data = await post('batchEmbedContents', { requests: slice.map((t) => req(t, 'RETRIEVAL_DOCUMENT')) });
        if (!data.embeddings || data.embeddings.length !== slice.length) throw new Error('unexpected embedding response');
        out.push(...data.embeddings.map((e) => normalize(e.values)));
      }
      return out;
    },
    async embedQuery(text) {
      const data = await post('embedContent', req(text, 'RETRIEVAL_QUERY'));
      if (!data.embedding?.values) throw new Error('unexpected embedding response');
      return normalize(data.embedding.values);
    },
  };
}

module.exports = { createGeminiEmbedder, normalize };