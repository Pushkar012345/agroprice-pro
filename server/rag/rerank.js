// Reranker: a second-stage model that reads (query, passage) TOGETHER and scores relevance.
// Embedding search is fast but coarse (query and passage are embedded separately); a reranker is
// slower but much better at ordering a small candidate set. Jina and Cohere share one request shape:
//   POST { model, query, documents: [string], top_n }  ->  { results: [{ index, relevance_score }] }
// Optional: without RERANK_API_KEY the pipeline simply skips this stage.

const axios = require('axios');

const PRESETS = {
  jina: { url: 'https://api.jina.ai/v1/rerank', model: 'jina-reranker-v2-base-multilingual' },
  cohere: { url: 'https://api.cohere.com/v2/rerank', model: 'rerank-v3.5' },
};
const MAX_DOC_CHARS = 2000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function createReranker({
  apiKey, provider = 'jina', url, model, http = axios, retries = 2, timeoutMs = 8000,
} = {}) {
  if (!apiKey) throw new Error('RERANK_API_KEY is required for reranking');
  const preset = PRESETS[provider];
  if (!preset && !url) throw new Error(`unknown rerank provider "${provider}" (use jina or cohere, or set RERANK_URL)`);
  const endpoint = url || preset.url;
  const modelName = model || preset?.model;

  return {
    provider,
    model: modelName,
    // docs: string[]  ->  [{ index, score }] best first (index points into docs)
    async rerank(query, docs, topN = docs.length) {
      if (docs.length === 0) return [];
      const body = {
        model: modelName,
        query,
        documents: docs.map((d) => String(d).slice(0, MAX_DOC_CHARS)),
        top_n: Math.min(topN, docs.length),
      };
      for (let attempt = 0; ; attempt++) {
        try {
          const { data } = await http.post(endpoint, body, {
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            timeout: timeoutMs,
          });
          const results = data?.results;
          if (!Array.isArray(results)) throw new Error('unexpected rerank response');
          const ok = results.filter((r) => Number.isInteger(r.index) && r.index >= 0 && r.index < docs.length && Number.isFinite(r.relevance_score));
          if (ok.length === 0 && results.length > 0) throw new Error('unexpected rerank response');
          return ok.map((r) => ({ index: r.index, score: r.relevance_score })).sort((a, b) => b.score - a.score);
        } catch (err) {
          const status = err.response?.status;
          if (attempt < retries && (status === 429 || status >= 500)) { await sleep(500 * 2 ** attempt); continue; }
          // The message never includes the request headers, so the key cannot leak into logs.
          throw new Error(`rerank request failed${status ? ` (${status})` : `: ${err.message}`}`);
        }
      }
    },
  };
}

// RERANK_API_KEY [+ RERANK_PROVIDER=jina|cohere, RERANK_MODEL, RERANK_URL]. No key -> null (stage skipped).
function createRerankerFromEnv(env = process.env) {
  if (!env.RERANK_API_KEY) return null;
  return createReranker({
    apiKey: env.RERANK_API_KEY,
    provider: (env.RERANK_PROVIDER || 'jina').toLowerCase(),
    model: env.RERANK_MODEL || undefined,
    url: env.RERANK_URL || undefined,
  });
}

module.exports = { createReranker, createRerankerFromEnv, PRESETS };