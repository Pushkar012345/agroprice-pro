const test = require('node:test');
const assert = require('node:assert/strict');
const { keywordTerms, bm25 } = require('../rag/text');
const { rrfFuse } = require('../rag/fusion');
const { createMemoryStore, createPgVectorStore } = require('../rag/store');
const { createKnowledge } = require('../rag/knowledge');
const { createReranker, createRerankerFromEnv } = require('../rag/rerank');
const { runWithTrace } = require('../observability/tracing');

// ---------- helpers ----------
const unit = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
const row = (title, content, embedding, chunkIndex = 0) => ({ title, url: null, chunkIndex, content, embedding: unit(embedding) });
// Fixed-vector embedder: every query embeds to the same vector, so cosine is fully controlled by the test.
const embedderFor = (v) => ({ embedQuery: async () => unit(v), embedDocuments: async (t) => t.map(() => unit(v)) });

async function corpus() {
  const store = createMemoryStore();
  // query vector will be [1,0,0]. Cosines: decoy .95, grain .90, cacp .80, weather 0.
  await store.upsertSource('decoy', [row('Markets', 'Crops are sold at the market every morning', [0.95, 0.31, 0])]);
  await store.upsertSource('grain', [row('Storage', 'Keep grain dry and ventilated', [0.9, 0.436, 0])]);
  await store.upsertSource('cacp', [row('Support price', 'The CACP recommends the support price', [0.8, 0.6, 0])]);
  await store.upsertSource('weather', [row('Weather', 'Rain and weather forecast for the week', [0, 1, 0])]);
  return store;
}
const ids = (hits) => hits.map((h) => h.source);

// ---------- text helpers ----------
test('keywordTerms: drops stopwords and operators, dedupes, keeps rare words and numbers', () => {
  assert.deepEqual(keywordTerms('does onion have MSP?'), ['onion', 'msp']);
  assert.deepEqual(keywordTerms("e-NAM & 'fee' | (2500) !x :*"), ['nam', 'fee', '2500']);
  assert.deepEqual(keywordTerms('the of and'), []);
  assert.deepEqual(keywordTerms('Onion onion ONION'), ['onion']);
  assert.equal(keywordTerms('a b c d e f g h i j k l m n o p alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi').length <= 12, true);
});

test('bm25: rarer terms and shorter docs score higher; no term = 0', () => {
  const scores = bm25([{ text: 'onion price onion' }, { text: 'wheat price in the market today' }, { text: 'nothing here' }], ['onion', 'price']);
  assert.ok(scores[0] > scores[1] && scores[1] > 0);
  assert.equal(scores[2], 0);
});

// ---------- fusion ----------
test('rrfFuse: a chunk high in both lists beats one that is first in only one; ranks are recorded', () => {
  const h = (source, score = 0.5) => ({ source, chunkIndex: 0, score });
  const out = rrfFuse({ vector: [h('a'), h('b'), h('c')], keyword: [h('c'), h('b')] });
  assert.deepEqual(ids(out), ['c', 'b', 'a']);   // c: 1/63 + 1/61, b: 1/62 + 1/62 (c wins by a hair), a: 1/61 only
  assert.deepEqual(out.find((x) => x.source === 'c').ranks, { vector: 3, keyword: 1 });
  assert.ok(out[0].rrf > out[2].rrf);
});

test('rrfFuse: same chunk in both lists appears once; empty input is fine', () => {
  const h = (source) => ({ source, chunkIndex: 0, score: 0.5 });
  assert.equal(rrfFuse({ vector: [h('a')], keyword: [h('a')] }).length, 1);
  assert.deepEqual(rrfFuse({ vector: [], keyword: [] }), []);
});

// ---------- stores ----------
test('memory store searchText: BM25 order, cosine score attached, no terms -> nothing', async () => {
  const store = await corpus();
  const hits = await store.searchText('who is CACP', 5, unit([1, 0, 0]));
  assert.deepEqual(ids(hits), ['cacp']);
  assert.ok(Math.abs(hits[0].score - 0.8) < 1e-9);
  assert.equal(hits[0].embedding, undefined);
  assert.deepEqual(await store.searchText('the of and', 5, unit([1, 0, 0])), []);
});

test('pg store searchText: user text only ever travels as a bound parameter', async () => {
  const calls = [];
  const prisma = { $queryRaw: async (strings, ...values) => { calls.push({ sql: strings.join('?'), values }); return [{ source: 's', title: 't', url: null, chunkIndex: 0, content: 'c', score: '0.7' }]; } };
  const store = createPgVectorStore(prisma);
  const hits = await store.searchText("onion'); DROP TABLE x;-- & msp", 5, [1, 0]);
  assert.equal(hits[0].score, 0.7);
  assert.match(calls[0].sql, /to_tsquery\('english', \?\)/);
  assert.doesNotMatch(calls[0].sql, /DROP/);
  assert.ok(calls[0].values.includes('onion | drop | table | msp'));      // only [a-z0-9] words, joined with |
  assert.deepEqual(await store.searchText('the of', 5, [1, 0]), []);       // no terms: no query at all
  assert.equal(calls.length, 1);
});

// ---------- hybrid retrieval ----------
test('vector alone misses the exact-term chunk; hybrid brings it to the top', async () => {
  const store = await corpus();
  const kb = createKnowledge({ embedder: embedderFor([1, 0, 0]), store, minScore: 0.5 });
  const vec = await kb.search('who is CACP', { topK: 3, mode: 'vector' });
  assert.deepEqual(ids(vec), ['decoy', 'grain', 'cacp']);
  const hyb = await kb.search('who is CACP', { topK: 3, mode: 'hybrid' });
  assert.equal(hyb[0].source, 'cacp');
  assert.deepEqual(hyb[0].ranks, { vector: 3, keyword: 1 });
  assert.ok(Math.abs(hyb[0].score - 0.8) < 1e-9, 'score stays the cosine similarity');
  assert.equal(ids(await kb.search('who is CACP', { topK: 3 }))[0], 'cacp', 'hybrid is the default');
});

test('keyword mode returns only keyword matches', async () => {
  const kb = createKnowledge({ embedder: embedderFor([1, 0, 0]), store: await corpus(), minScore: 0.5 });
  assert.deepEqual(ids(await kb.search('CACP', { mode: 'keyword' })), ['cacp']);
});

test('the relevance gate still applies: a keyword match with low similarity is NOT returned', async () => {
  const kb = createKnowledge({ embedder: embedderFor([1, 0, 0]), store: await corpus(), minScore: 0.5 });
  const gated = await kb.search('weather forecast', { topK: 5 });
  assert.ok(!ids(gated).includes('weather'), 'the keyword match has cosine 0, below minScore, so it is dropped');
  // With a threshold above every chunk the bot gets nothing at all and says "I do not know".
  const strict = createKnowledge({ embedder: embedderFor([1, 0, 0]), store: await corpus(), minScore: 0.99 });
  assert.deepEqual(await strict.search('weather forecast', { topK: 5 }), []);
  const raw = await kb.search('weather forecast', { topK: 3, withScoresBelowThreshold: true });
  assert.ok(ids(raw).includes('weather'), 'but it is visible when the threshold is bypassed for debugging');
});

test('vector mode never touches keyword search', async () => {
  const store = await corpus();
  store.searchText = async () => { throw new Error('should not be called'); };
  const kb = createKnowledge({ embedder: embedderFor([1, 0, 0]), store, minScore: 0.5, mode: 'vector' });
  assert.equal((await kb.search('CACP')).length, 3);
});

test('keyword search failure degrades to vector search and warns once', async () => {
  const store = await corpus();
  store.searchText = async () => { throw new Error('column "search_tsv" does not exist'); };
  const logs = [];
  const kb = createKnowledge({ embedder: embedderFor([1, 0, 0]), store, minScore: 0.5, log: (m) => logs.push(m) });
  assert.deepEqual(ids(await kb.search('who is CACP', { topK: 3 })), ['decoy', 'grain', 'cacp']);
  await kb.search('who is CACP');
  assert.equal(logs.length, 1);
  assert.match(logs[0], /search_tsv/);
});

test('a store without searchText (older store) still works', async () => {
  const store = await corpus();
  delete store.searchText;
  const kb = createKnowledge({ embedder: embedderFor([1, 0, 0]), store, minScore: 0.5 });
  assert.equal((await kb.search('who is CACP', { topK: 3 })).length, 3);
});

// ---------- rerank stage ----------
const fakeReranker = (impl) => { const calls = []; return { calls, provider: 'fake', model: 'm', rerank: async (q, docs, n) => { calls.push({ q, docs, n }); return impl(q, docs, n); } }; };

test('reranker reorders the gated candidates, attaches its score, and sees title + content', async () => {
  const reranker = fakeReranker((q, docs) => [{ index: 2, score: 0.97 }, { index: 0, score: 0.4 }]);
  const kb = createKnowledge({ embedder: embedderFor([1, 0, 0]), store: await corpus(), reranker, minScore: 0.5 });
  const hits = await kb.search('who is CACP', { topK: 2 });
  assert.equal(reranker.calls.length, 1);
  assert.equal(reranker.calls[0].n, 2, 'asks for only topK results');
  assert.equal(reranker.calls[0].docs.length, 3, 'only candidates that passed the gate are sent');
  assert.match(reranker.calls[0].docs[0], /^Support price\nThe CACP recommends/);   // hybrid order puts cacp first
  assert.equal(hits.length, 2);
  assert.equal(hits[0].rerankScore, 0.97);
});

test('reranker failure keeps the fused order and warns once', async () => {
  const logs = [];
  const reranker = fakeReranker(() => { throw new Error('rerank request failed (500)'); });
  const kb = createKnowledge({ embedder: embedderFor([1, 0, 0]), store: await corpus(), reranker, minScore: 0.5, log: (m) => logs.push(m) });
  const hits = await kb.search('who is CACP', { topK: 3 });
  assert.equal(hits[0].source, 'cacp');
  assert.equal(hits[0].rerankScore, undefined);
  await kb.search('who is CACP');
  assert.equal(logs.length, 1);
});

test('rerank is skipped for rerank:false, for a single candidate, and when nothing passes the gate', async () => {
  const reranker = fakeReranker(() => [{ index: 0, score: 1 }]);
  const withStore = async (minScore) => createKnowledge({ embedder: embedderFor([1, 0, 0]), store: await corpus(), reranker, minScore });

  await (await withStore(0.5)).search('who is CACP', { rerank: false });
  assert.equal(reranker.calls.length, 0, 'rerank:false');
  await (await withStore(0.93)).search('who is CACP', { mode: 'vector' });      // only the decoy (.95) passes
  assert.equal(reranker.calls.length, 0, 'one candidate: nothing to reorder');
  await (await withStore(1.01)).search('who is CACP');                          // nothing passes
  assert.equal(reranker.calls.length, 0, 'empty candidate list');
  await (await withStore(0.5)).search('who is CACP');                           // positive control
  assert.equal(reranker.calls.length, 1);
});

test('an empty rerank result falls back to the fused order', async () => {
  const kb = createKnowledge({ embedder: embedderFor([1, 0, 0]), store: await corpus(), reranker: fakeReranker(() => []), minScore: 0.5 });
  assert.equal((await kb.search('who is CACP', { topK: 3 }))[0].source, 'cacp');
});

test('each retrieval stage shows up as a span on the active trace', async () => {
  const spans = [];
  const trace = { generation: () => ({ end() {} }), end() {}, span: (d) => { const o = { ...d }; spans.push(o); return { end: (e) => { o.ended = e; } }; } };
  const reranker = fakeReranker(() => [{ index: 0, score: 0.9 }]);
  const kb = createKnowledge({ embedder: embedderFor([1, 0, 0]), store: await corpus(), reranker, minScore: 0.5 });
  await runWithTrace(trace, () => kb.search('who is CACP'));
  assert.deepEqual(spans.map((s) => s.name), ['rag.embed_query', 'rag.vector_search', 'rag.keyword_search', 'rag.fuse', 'rag.threshold_filter', 'rag.rerank']);
  assert.deepEqual(spans.find((s) => s.name === 'rag.fuse').ended.output[0].ranks, { vector: 3, keyword: 1 });
  assert.deepEqual(spans.find((s) => s.name === 'rag.threshold_filter').ended.output, { retrieved: 4, kept: 3 });
});

// ---------- reranker client ----------
const okHttp = (results, seen = []) => ({ post: async (url, body, cfg) => { seen.push({ url, body, cfg }); return { data: { results } }; } });

test('reranker client: jina request shape, sorted output, long documents truncated', async () => {
  const seen = [];
  const r = createReranker({ apiKey: 'sk-secret', http: okHttp([{ index: 1, relevance_score: 0.2 }, { index: 0, relevance_score: 0.9 }], seen) });
  const out = await r.rerank('q', ['a'.repeat(5000), 'b'], 1);
  assert.deepEqual(out, [{ index: 0, score: 0.9 }, { index: 1, score: 0.2 }]);
  assert.equal(seen[0].url, 'https://api.jina.ai/v1/rerank');
  assert.equal(seen[0].cfg.headers.Authorization, 'Bearer sk-secret');
  assert.equal(seen[0].body.model, 'jina-reranker-v2-base-multilingual');
  assert.equal(seen[0].body.top_n, 1);
  assert.equal(seen[0].body.documents[0].length, 2000);
});

test('reranker client: cohere preset, env factory, unknown provider', () => {
  const seen = [];
  const c = createReranker({ apiKey: 'k', provider: 'cohere', http: okHttp([], seen) });
  assert.equal(c.model, 'rerank-v3.5');
  assert.equal(createRerankerFromEnv({}), null);
  assert.equal(createRerankerFromEnv({ RERANK_API_KEY: '' }), null);
  assert.equal(createRerankerFromEnv({ RERANK_API_KEY: 'k', RERANK_PROVIDER: 'Cohere' }).provider, 'cohere');
  assert.throws(() => createReranker({ apiKey: 'k', provider: 'nope' }), /unknown rerank provider/);
  assert.throws(() => createReranker({}), /RERANK_API_KEY/);
});

test('reranker client: retries 429, rejects malformed responses, never leaks the key', async () => {
  let n = 0;
  const flaky = { post: async () => { if (n++ === 0) throw Object.assign(new Error('x'), { response: { status: 429 } }); return { data: { results: [{ index: 0, relevance_score: 0.5 }] } }; } };
  assert.deepEqual(await createReranker({ apiKey: 'k', http: flaky }).rerank('q', ['a']), [{ index: 0, score: 0.5 }]);
  assert.equal(n, 2);

  const bad = createReranker({ apiKey: 'sk-secret', http: { post: async () => ({ data: { oops: true } }) } });
  await assert.rejects(bad.rerank('q', ['a']), (e) => /rerank request failed/.test(e.message) && !e.message.includes('sk-secret'));
  const oob = createReranker({ apiKey: 'k', http: okHttp([{ index: 9, relevance_score: 1 }]) });
  await assert.rejects(oob.rerank('q', ['a']), /rerank request failed/);

  const down = createReranker({ apiKey: 'sk-secret', retries: 0, http: { post: async () => { throw Object.assign(new Error('Bearer sk-secret refused'), { response: { status: 401 } }); } } });
  await assert.rejects(down.rerank('q', ['a']), (e) => e.message === 'rerank request failed (401)');
  assert.deepEqual(await createReranker({ apiKey: 'k', http: okHttp([]) }).rerank('q', []), []);
});