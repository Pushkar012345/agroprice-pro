const test = require('node:test');
const assert = require('node:assert/strict');
const { Embeddings } = require('@langchain/core/embeddings');
const { Document } = require('@langchain/core/documents');
const { BaseRetriever } = require('@langchain/core/retrievers');
const { RunnableLambda } = require('@langchain/core/runnables');
const { KnowledgeRetriever, createLangChainEmbeddings, createLangChainKnowledge } = require('../rag/langchain-retriever');
const { createKnowledge } = require('../rag/knowledge');
const { createKnowledgeFromEnv } = require('../rag/factory');
const { createMemoryStore } = require('../rag/store');
const { toolsByName } = require('../agent/tools');
const { runWithTrace } = require('../observability/tracing');
const { repo } = require('./helpers');

const unit = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
const row = (title, content, embedding, chunkIndex = 0) => ({ title, url: null, chunkIndex, content, embedding: unit(embedding) });

// A real LangChain Embeddings subclass that always returns the same query vector.
class FixedEmbeddings extends Embeddings {
  constructor(vec) { super({}); this.vec = unit(vec); }
  async embedQuery() { return this.vec; }
  async embedDocuments(texts) { return texts.map(() => this.vec); }
}

async function store() {
  const s = createMemoryStore();
  // query vector is [1,0,0]: cosines are .95 / .90 / .80 / 0
  await s.upsertSource('markets', [row('Markets', 'Crops are sold at the market', [0.95, 0.31, 0])]);
  await s.upsertSource('storage', [row('Storage', 'Keep grain dry', [0.9, 0.436, 0])]);
  await s.upsertSource('msp', [row('MSP', 'Minimum support price', [0.8, 0.6, 0])]);
  await s.upsertSource('weather', [row('Weather', 'Rain forecast', [0, 1, 0])]);
  return s;
}

test('langchain: the retriever is a real BaseRetriever; invoke() returns Documents in score order', async () => {
  const retriever = new KnowledgeRetriever({ embeddings: new FixedEmbeddings([1, 0, 0]), store: await store(), minScore: 0.5, k: 3 });
  assert.ok(retriever instanceof BaseRetriever);
  const docs = await retriever.invoke('anything');
  assert.equal(docs.length, 3);
  assert.ok(docs.every((d) => d instanceof Document));
  assert.deepEqual(docs.map((d) => d.metadata.source), ['markets', 'storage', 'msp']);
  assert.equal(docs[0].pageContent, 'Crops are sold at the market');
  assert.ok(Math.abs(docs[0].metadata.score - unit([0.95, 0.31, 0])[0]) < 1e-9);
  assert.equal(docs[0].metadata.title, 'Markets');
});

test('langchain: the relevance threshold still applies, so off-topic chunks never come back', async () => {
  const retriever = new KnowledgeRetriever({ embeddings: new FixedEmbeddings([1, 0, 0]), store: await store(), minScore: 0.85, k: 5 });
  assert.deepEqual((await retriever.invoke('q')).map((d) => d.metadata.source), ['markets', 'storage']);
  const strict = new KnowledgeRetriever({ embeddings: new FixedEmbeddings([1, 0, 0]), store: await store(), minScore: 0.99 });
  assert.deepEqual(await strict.invoke('q'), [], 'nothing relevant -> empty -> the bot says it does not know');
});

test('langchain: composes like any LangChain runnable (batch, pipe)', async () => {
  const retriever = new KnowledgeRetriever({ embeddings: new FixedEmbeddings([1, 0, 0]), store: await store(), minScore: 0.85, k: 5 });
  const batch = await retriever.batch(['a', 'b']);
  assert.equal(batch.length, 2);
  const chain = retriever.pipe(RunnableLambda.from((docs) => docs.map((d) => d.metadata.source)));
  assert.deepEqual(await chain.invoke('q'), ['markets', 'storage']);
});

test('langchain: parity with the native engine on the same embeddings and store', async () => {
  const s = await store();
  const lc = createLangChainKnowledge({ embeddings: new FixedEmbeddings([1, 0, 0]), store: s, minScore: 0.5 });
  const native = createKnowledge({ embedder: { embedQuery: async () => unit([1, 0, 0]) }, store: s, minScore: 0.5, mode: 'vector' });
  for (const opts of [{ topK: 3 }, { topK: 1 }, { topK: 5, withScoresBelowThreshold: true }]) {
    const a = await lc.search('q', opts);
    const b = await native.search('q', opts);
    assert.deepEqual(a.map((h) => [h.source, h.chunkIndex, h.score]), b.map((h) => [h.source, h.chunkIndex, h.score]));
  }
});

test('langchain: knowledge adapter has the same shape the tools expect, and search_knowledge works through it', async () => {
  const kb = createLangChainKnowledge({ embeddings: new FixedEmbeddings([1, 0, 0]), store: await store(), minScore: 0.5 });
  assert.equal(kb.mode, 'langchain-vector');
  const hits = await kb.search('q', { topK: 2 });
  assert.deepEqual(Object.keys(hits[0]).sort(), ['chunkIndex', 'content', 'score', 'source', 'title', 'url']);
  const out = await toolsByName.search_knowledge.run({ query: 'q', top_k: 2 }, { ...repo, searchKnowledge: (q, o) => kb.search(q, { topK: o.topK }) });
  assert.equal(out.found, true);
  assert.deepEqual(out.passages.map((p) => p.source), ['markets', 'storage']);
});

test('langchain: errors from the embeddings propagate, nothing is swallowed', async () => {
  const broken = new (class extends Embeddings { constructor() { super({}); } async embedQuery() { throw new Error('embedding service down'); } async embedDocuments() { return []; } })();
  const retriever = new KnowledgeRetriever({ embeddings: broken, store: await store() });
  await assert.rejects(retriever.invoke('q'), /embedding service down/);
});

test('langchain: retrieval stages are traced like the native engine', async () => {
  const spans = [];
  const trace = { generation: () => ({ end() {} }), end() {}, span: (d) => { const o = { ...d }; spans.push(o); return { end: (e) => { o.ended = e; } }; } };
  const kb = createLangChainKnowledge({ embeddings: new FixedEmbeddings([1, 0, 0]), store: await store(), minScore: 0.5 });
  await runWithTrace(trace, () => kb.search('q'));
  assert.deepEqual(spans.map((s) => s.name), ['rag.embed_query', 'rag.vector_search', 'rag.threshold_filter']);
  assert.deepEqual(spans[2].ended.output, { retrieved: 4, kept: 3 });
});

test('langchain: constructor needs embeddings and a store', () => {
  assert.throws(() => new KnowledgeRetriever({ store: {} }), /required/);
  assert.throws(() => new KnowledgeRetriever({ embeddings: {} }), /required/);
});

test('langchain: Gemini embeddings are configured to match the stored vectors', () => {
  const e = createLangChainEmbeddings({ apiKey: 'k' });
  assert.equal(e.taskType, 'RETRIEVAL_QUERY');
  assert.equal(e.outputDimensionality, 768);
  assert.equal(e.stripNewLines, false);
  assert.equal(createLangChainEmbeddings({ apiKey: 'k', dims: 256 }).outputDimensionality, 256);
  assert.throws(() => createLangChainEmbeddings({ apiKey: '' }), /GEMINI_API_KEY/);
});

test('factory: RAG_ENGINE=langchain switches engines, anything else keeps the native one', () => {
  assert.equal(createKnowledgeFromEnv({}, { GEMINI_API_KEY: 'k', RAG_ENGINE: 'langchain' }).mode, 'langchain-vector');
  assert.equal(createKnowledgeFromEnv({}, { GEMINI_API_KEY: 'k', RAG_ENGINE: 'LangChain' }).mode, 'langchain-vector');
  assert.notEqual(createKnowledgeFromEnv({}, { GEMINI_API_KEY: 'k' }).mode, 'langchain-vector');
  assert.notEqual(createKnowledgeFromEnv({}, { GEMINI_API_KEY: 'k', RAG_ENGINE: 'native' }).mode, 'langchain-vector');
  assert.equal(createKnowledgeFromEnv({}, { RAG_ENGINE: 'langchain' }), undefined, 'still optional without a Gemini key');
});