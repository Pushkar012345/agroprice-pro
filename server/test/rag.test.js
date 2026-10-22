const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseDoc, chunkDoc } = require('../rag/chunk');
const { createKnowledge } = require('../rag/knowledge');
const { createMemoryStore } = require('../rag/store');
const { createGeminiEmbedder } = require('../rag/embeddings');
const { toolsByName } = require('../agent/tools');
const { runAgent } = require('../agent/agent');
const { repo, fakeGroq, toolCall, text } = require('./helpers');

// Deterministic stand-in for a real embedding model: hashed bag of words, unit length.
const STOP = new Set(['the', 'a', 'an', 'is', 'of', 'to', 'and', 'in', 'for', 'what', 'does', 'do', 'how', 'it', 'on', 'or']);
function hashEmbed(s, dims = 256) {
  const v = new Array(dims).fill(0);
  for (const w of s.toLowerCase().match(/[a-z\-]+/g) || []) {
    if (STOP.has(w)) continue;
    let h = 0;
    for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    v[h % dims] += 1;
  }
  const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map((x) => x / n);
}
const fakeEmbedder = {
  embedDocuments: async (ts) => ts.map((t) => hashEmbed(t)),
  embedQuery: async (t) => hashEmbed(t),
};

const DIR = path.join(__dirname, '..', 'knowledge');
const realDocs = () => fs.readdirSync(DIR).filter((f) => f.endsWith('.md'))
  .map((f) => ({ filename: f, raw: fs.readFileSync(path.join(DIR, f), 'utf8') }));

async function buildKb(minScore = 0.15) {
  const store = createMemoryStore();
  const kb = createKnowledge({ embedder: fakeEmbedder, store, minScore });
  const summary = await kb.ingest(realDocs());
  return { kb, store, summary };
}

// ── chunking ──
test('parseDoc: title, source url and body are separated', () => {
  const d = parseDoc('x.md', '# My Title\nSource: https://example.org\n\n## H\nbody');
  assert.equal(d.title, 'My Title');
  assert.equal(d.url, 'https://example.org');
  assert.equal(d.source, 'x');
  assert.ok(!d.body.includes('Source:'));
});

test('chunkDoc: chunks never cross headings and carry their heading', () => {
  const d = parseDoc('x.md', '# T\n\n## Alpha\nalpha text\n\n## Beta\nbeta text');
  const c = chunkDoc(d);
  assert.equal(c.length, 2);
  assert.match(c[0].content, /^Alpha\nalpha text/);
  assert.match(c[1].content, /^Beta\nbeta text/);
  assert.deepEqual(c.map((x) => x.chunkIndex), [0, 1]);
});

test('chunkDoc: long sections are split under maxChars, nothing is lost', () => {
  const para = (n) => `Sentence number ${n} is here. `.repeat(8).trim();
  const body = [1, 2, 3, 4, 5].map(para).join('\n\n');
  const c = chunkDoc(parseDoc('x.md', `# T\n## H\n${body}`), { maxChars: 400 });
  assert.ok(c.length > 1);
  assert.ok(c.every((x) => x.content.length <= 400), 'every chunk within budget');
  const joined = c.map((x) => x.content).join(' ');
  for (let n = 1; n <= 5; n++) assert.ok(joined.includes(`Sentence number ${n} is here.`));
});

test('real knowledge files all produce chunks within budget', () => {
  for (const { filename, raw } of realDocs()) {
    const chunks = chunkDoc(parseDoc(filename, raw));
    assert.ok(chunks.length > 0, filename);
    assert.ok(chunks.every((c) => c.content.length <= 900), filename);
  }
});

// ── retrieval pipeline ──
test('ingest then search returns the right source first', async () => {
  const { kb, summary } = await buildKb();
  assert.equal(summary.length, 4);
  const msp = await kb.search('what is minimum support price MSP');
  assert.equal(msp[0].source, 'msp-basics');
  const modal = await kb.search('what does modal price mean min max');
  assert.equal(modal[0].source, 'reading-mandi-prices');
  const enam = await kb.search('how does e-NAM online trading work');
  assert.equal(enam[0].source, 'apmc-and-enam');
});

test('re-ingesting replaces chunks instead of duplicating them', async () => {
  const { kb, store } = await buildKb();
  const before = store.size;
  await kb.ingest(realDocs());
  assert.equal(store.size, before);
});

test('unrelated question falls below the score threshold (no passages)', async () => {
  const { kb } = await buildKb(0.4);
  const hits = await kb.search('write a poem about the ocean and love');
  assert.equal(hits.length, 0);
});

// ── embedder (HTTP mocked) ──
test('gemini embedder: request shape, batching, normalisation', async () => {
  const calls = [];
  const http = {
    async post(url, body, opts) {
      calls.push({ url, body, opts });
      if (url.endsWith(':batchEmbedContents')) return { data: { embeddings: body.requests.map(() => ({ values: [3, 4] })) } };
      return { data: { embedding: { values: [3, 4] } } };
    },
  };
  const e = createGeminiEmbedder({ apiKey: 'k', http, dims: 2 });
  const docs = await e.embedDocuments(['a', 'b']);
  assert.deepEqual(docs[0], [0.6, 0.8]);
  assert.equal(calls[0].body.requests[0].taskType, 'RETRIEVAL_DOCUMENT');
  assert.equal(calls[0].body.requests[0].outputDimensionality, 2);
  assert.equal(calls[0].opts.headers['x-goog-api-key'], 'k');
  const q = await e.embedQuery('hello');
  assert.equal(calls[1].body.taskType, 'RETRIEVAL_QUERY');
  assert.deepEqual(q, [0.6, 0.8]);
  assert.throws(() => createGeminiEmbedder({}), /GEMINI_API_KEY/);
});

test('gemini embedder: retries 429 then succeeds; error text hides the key', async () => {
  let n = 0;
  const http = { async post() { if (n++ === 0) { const e = new Error('x'); e.response = { status: 429 }; throw e; } return { data: { embedding: { values: [1, 0] } } }; } };
  const e = createGeminiEmbedder({ apiKey: 'secret-key', http, dims: 2 });
  assert.deepEqual(await e.embedQuery('q'), [1, 0]);

  const bad = { async post() { const err = new Error('boom secret-key'); err.response = { status: 400 }; throw err; } };
  await assert.rejects(createGeminiEmbedder({ apiKey: 'secret-key', http: bad, dims: 2 }).embedQuery('q'), (err) => !/secret-key/.test(err.message));
});

// ── tool + agent ──
test('search_knowledge: returns passages with source for citation', async () => {
  const { kb } = await buildKb();
  const r = { ...repo, searchKnowledge: (q, o) => kb.search(q, o) };
  const t = toolsByName.search_knowledge;
  const out = await t.run(t.validate({ query: 'does onion have MSP' }), r);
  assert.equal(out.found, true);
  assert.ok(out.passages[0].source);
  assert.ok(out.passages[0].text.length > 0);
});

test('search_knowledge: not found / not configured are reported, not invented', async () => {
  const t = toolsByName.search_knowledge;
  assert.equal((await t.run(t.validate({ query: 'x' }), repo)).found, false);
  const empty = { ...repo, searchKnowledge: async () => [] };
  assert.equal((await t.run(t.validate({ query: 'x' }), empty)).found, false);
  assert.throws(() => t.validate({}));
  assert.throws(() => t.validate({ query: 'x', top_k: 50 }));
});

test('agent: knowledge question -> search_knowledge -> cited answer', async () => {
  const { kb } = await buildKb();
  const r = { ...repo, searchKnowledge: (q, o) => kb.search(q, o) };
  const groq = fakeGroq([toolCall('search_knowledge', { query: 'what is MSP' }), text('MSP is a government floor price [msp-basics].')]);
  const out = await runAgent({ groq, repo: r, messages: [{ role: 'user', content: 'What is MSP?' }] });
  assert.equal(out.toolCalls[0].name, 'search_knowledge');
  assert.equal(out.toolCalls[0].ok, true);
  assert.match(groq.requests[1].messages.at(-1).content, /msp-basics/);
  assert.match(out.reply, /\[msp-basics\]/);
  assert.ok(groq.requests[0].tools.some((t) => t.function.name === 'search_knowledge'));
});