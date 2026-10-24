// The RAG pipeline.
//   ingest: chunk -> embed -> store
//   search: embed query -> [vector search + keyword search] -> RRF fusion -> relevance gate -> [rerank]
//
// Why hybrid: vector search understands meaning ("will the government buy my tomatoes" ~ MSP) but can
// miss exact terms and rare words; keyword search is the opposite. Fusing both ranks covers both.
// The relevance gate (cosine >= minScore) is unchanged: it is what lets the bot say "I don't know".
// Keyword hits only help ranking and recall, they can never let an off-topic chunk through.

const { parseDoc, chunkDoc } = require('./chunk');
const { rrfFuse } = require('./fusion');
const { withSpan, activeTrace } = require('../observability/tracing');

// Below this cosine similarity a hit is treated as "not in the knowledge base", so the
// agent says it doesn't know instead of answering from an irrelevant passage.
// Tune with RAG_MIN_SCORE after looking at real scores (run `npm run ingest -- --query "..."`).
const DEFAULT_MIN_SCORE = Number(process.env.RAG_MIN_SCORE) || 0.55;
const DEFAULT_CANDIDATES = Number(process.env.RAG_CANDIDATES) || 15; // chunks fetched per ranker before fusion
const MODES = ['vector', 'keyword', 'hybrid'];
const DEFAULT_MODE = MODES.includes(process.env.RAG_MODE) ? process.env.RAG_MODE : 'hybrid';

const brief = (hits) => hits.map((h) => ({ source: h.source, chunk: h.chunkIndex, score: Math.round(h.score * 1000) / 1000 }));

function createKnowledge({
  embedder, store, reranker = null, minScore = DEFAULT_MIN_SCORE, mode = DEFAULT_MODE,
  candidates = DEFAULT_CANDIDATES, log = console.warn,
}) {
  const warned = new Set();
  const warnOnce = (key, msg) => { if (!warned.has(key)) { warned.add(key); log(msg); } };

  return {
    reranker: reranker ? { provider: reranker.provider, model: reranker.model } : null,
    mode,

    // docs: [{ filename, raw }]
    async ingest(docs) {
      const summary = [];
      for (const { filename, raw } of docs) {
        const doc = parseDoc(filename, raw);
        const chunks = chunkDoc(doc);
        if (chunks.length === 0) continue;
        // The title is embedded with the text so "MSP" queries match even if a chunk never says it.
        const vectors = await embedder.embedDocuments(chunks.map((c) => `${doc.title}\n${c.content}`));
        await store.upsertSource(doc.source, chunks.map((c, i) => ({
          title: doc.title, url: doc.url, chunkIndex: c.chunkIndex, content: c.content, embedding: vectors[i],
        })));
        summary.push({ source: doc.source, chunks: chunks.length });
      }
      return summary;
    },

    // mode: 'vector' | 'keyword' | 'hybrid' (default from RAG_MODE). rerank:false skips the reranker.
    // Returned hits: { source, chunkIndex, title, url, content, score (cosine), rrf?, ranks?, rerankScore? }
    async search(query, { topK = 3, withScoresBelowThreshold = false, mode: m = mode, rerank = true } = {}) {
      // Spans attach to the active agent trace (no-ops outside one), so every stage is visible:
      // what each ranker returned, how fusion reordered it, what the gate dropped, what rerank decided.
      const vector = await withSpan('rag.embed_query', { query }, () => embedder.embedQuery(query), { summarize: (v) => ({ dims: v.length }) });
      const pool = Math.max(candidates, topK);

      const vectorHits = await withSpan('rag.vector_search', { topK: pool }, () => store.search(vector, pool), { summarize: brief });

      let keywordHits = [];
      if ((m === 'hybrid' || m === 'keyword') && store.searchText) {
        try {
          keywordHits = await withSpan('rag.keyword_search', { query, topK: pool }, () => store.searchText(query, pool, vector), { summarize: brief });
        } catch (err) {
          // e.g. the add_knowledge_fts migration has not been applied yet: degrade to vector search.
          warnOnce('keyword', `RAG keyword search unavailable, using vector search only: ${err?.message}`);
        }
      }

      let ranked;
      if (m === 'keyword' && keywordHits.length) ranked = keywordHits;
      else if (m === 'hybrid' && keywordHits.length) {
        ranked = rrfFuse({ vector: vectorHits, keyword: keywordHits });
        activeTrace().span({ name: 'rag.fuse', input: { vector: vectorHits.length, keyword: keywordHits.length } })
          .end({ output: ranked.slice(0, topK + 2).map((h) => ({ source: h.source, chunk: h.chunkIndex, rrf: Math.round(h.rrf * 10000) / 10000, ranks: h.ranks })) });
      } else ranked = vectorHits;

      const kept = withScoresBelowThreshold ? ranked : ranked.filter((h) => h.score >= minScore);
      activeTrace().span({ name: 'rag.threshold_filter', input: { minScore } }).end({ output: { retrieved: ranked.length, kept: kept.length } });

      if (reranker && rerank && kept.length > 1) {
        try {
          const order = await withSpan('rag.rerank', { candidates: kept.length, model: reranker.model }, () =>
            reranker.rerank(query, kept.map((h) => `${h.title}\n${h.content}`), topK),
          { summarize: (r) => r.map((x) => ({ source: kept[x.index].source, chunk: kept[x.index].chunkIndex, score: Math.round(x.score * 1000) / 1000 })) });
          if (order.length) return order.map((o) => ({ ...kept[o.index], rerankScore: o.score })).slice(0, topK);
        } catch (err) {
          warnOnce('rerank', `RAG rerank failed, keeping fused order: ${err?.message}`);
        }
      }
      return kept.slice(0, topK);
    },
  };
}

module.exports = { createKnowledge, DEFAULT_MIN_SCORE, MODES };