// The retrieval step, built with LangChain.js. Same job as rag/knowledge.js (vector mode), expressed
// with LangChain's own abstractions so it plugs into LangChain chains/agents:
//   - GoogleGenerativeAIEmbeddings   LangChain's Gemini embeddings (query side)
//   - BaseRetriever                  the standard retriever interface: retriever.invoke(query) -> Document[]
//   - Document                       { pageContent, metadata }
//
// Notes on the design:
//   * It runs on top of the SAME pgvector table as the rest of the app. LangChain's own PGVectorStore
//     expects its own table layout (id/content/metadata/vector), which would mean duplicating the data.
//   * Only QUERIES are embedded here, with taskType RETRIEVAL_QUERY. Ingestion stays on rag/embeddings.js
//     (RETRIEVAL_DOCUMENT), because LangChain's class uses one task type for both, and mixing them up
//     silently changes similarity scores.
//   * Same relevance threshold as knowledge.js: below RAG_MIN_SCORE a chunk is dropped, so the bot still
//     says "I don't know" on out-of-scope questions.
// Select it at runtime with RAG_ENGINE=langchain (see rag/factory.js).

const { BaseRetriever } = require('@langchain/core/retrievers');
const { Document } = require('@langchain/core/documents');
const { withSpan, activeTrace } = require('../observability/tracing');

const DEFAULT_MIN_SCORE = Number(process.env.RAG_MIN_SCORE) || 0.55;
const brief = (hits) => hits.map((h) => ({ source: h.source, chunk: h.chunkIndex, score: Math.round(h.score * 1000) / 1000 }));

class KnowledgeRetriever extends BaseRetriever {
  static lc_name() { return 'KnowledgeRetriever'; }
  lc_namespace = ['agroprice', 'retrievers'];

  // embeddings: any LangChain Embeddings. store: our vector store ({ search(vector, k) }).
  constructor({ embeddings, store, k = 3, minScore = DEFAULT_MIN_SCORE, candidates = 15, ...rest }) {
    super(rest);
    if (!embeddings || !store) throw new Error('embeddings and store are required');
    Object.assign(this, { embeddings, store, k, minScore, candidates });
  }

  // Raw chunks (our shape, cosine `score` attached), best first. bypassThreshold is for debugging/evals.
  async retrieve(query, { topK = this.k, bypassThreshold = false } = {}) {
    const vector = await withSpan('rag.embed_query', { query, engine: 'langchain' }, () => this.embeddings.embedQuery(query), { summarize: (v) => ({ dims: v.length }) });
    const pool = Math.max(this.candidates, topK);
    const hits = await withSpan('rag.vector_search', { topK: pool }, () => this.store.search(vector, pool), { summarize: brief });
    const kept = bypassThreshold ? hits : hits.filter((h) => h.score >= this.minScore);
    activeTrace().span({ name: 'rag.threshold_filter', input: { minScore: this.minScore } }).end({ output: { retrieved: hits.length, kept: kept.length } });
    return kept.slice(0, topK);
  }

  // The LangChain contract: invoke(query) goes through this and returns Documents.
  async _getRelevantDocuments(query) {
    return (await this.retrieve(query)).map((h) => new Document({
      pageContent: h.content,
      metadata: { source: h.source, chunkIndex: h.chunkIndex, title: h.title, url: h.url ?? undefined, score: h.score },
    }));
  }
}

// Gemini embeddings through LangChain, configured to match how the stored vectors were made
// (768 dims, query task type, newlines untouched).
function createLangChainEmbeddings({
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.EMBED_MODEL || 'gemini-embedding-001',
  dims = Number(process.env.EMBED_DIMS) || 768,
} = {}) {
  if (!apiKey) throw new Error('GEMINI_API_KEY is required for embeddings');
  const { GoogleGenerativeAIEmbeddings } = require('@langchain/google-genai'); // loaded lazily: optional dependency
  const embeddings = new GoogleGenerativeAIEmbeddings({ apiKey, model, taskType: 'RETRIEVAL_QUERY', outputDimensionality: dims });
  // The constructor ignores a stripNewLines option (verified in @langchain/google-genai 2.x), but the
  // field is what the embedding call reads. Set it directly so queries are sent exactly as typed.
  embeddings.stripNewLines = false;
  return embeddings;
}

// Same interface as createKnowledge() in knowledge.js, so repo/tools/MCP/evals can use either engine.
function createLangChainKnowledge({ embeddings, store, minScore = DEFAULT_MIN_SCORE, candidates = 15 }) {
  const retriever = new KnowledgeRetriever({ embeddings, store, minScore, candidates });
  return {
    mode: 'langchain-vector',
    reranker: null,
    retriever,
    async search(query, { topK = 3, withScoresBelowThreshold = false } = {}) {
      return retriever.retrieve(query, { topK, bypassThreshold: withScoresBelowThreshold });
    },
  };
}

module.exports = { KnowledgeRetriever, createLangChainEmbeddings, createLangChainKnowledge };