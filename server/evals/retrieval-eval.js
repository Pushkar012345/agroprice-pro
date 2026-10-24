// Retrieval eval: does the RIGHT chunk come back, and does the bot refuse when nothing fits?
// Compares retrieval setups on the same questions:
//   vector | vector via LangChain | keyword | hybrid (RRF) | hybrid + rerank (only if RERANK_API_KEY is set)
//
//   cd server && npm run eval:retrieval               real DB + Gemini (needs `npm run ingest` first)
//   cd server && npm run eval:retrieval -- --offline  fake hashed embeddings, in-memory store: checks the
//                                                     script works, numbers are NOT representative
//
// Each question names the chunk(s) that actually contain the answer ("gold"). Metrics:
//   Hit@1 / Hit@3  gold chunk is the first / in the first three results (ranking quality, threshold off)
//   MRR            mean of 1/rank of the gold chunk (0 if not in top 5)
//   Usable@3       gold chunk is in the top 3 AFTER the relevance threshold (what the agent really sees)
//   Refusal        unanswerable questions that correctly return nothing (higher = fewer made-up answers)
// The questions marked holdout:true are reported in their own table and are NOT used for threshold calibration.
// Set EVAL_DELAY_MS (e.g. 6500 for a Cohere trial key, 10 requests/min) to pace rerank calls.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createKnowledge } = require('../rag/knowledge');
const { createRerankerFromEnv } = require('../rag/rerank');
const { createLangChainKnowledge, createLangChainEmbeddings } = require('../rag/langchain-retriever');

const OFFLINE = process.argv.includes('--offline');
const DELAY = Number(process.env.EVAL_DELAY_MS) || 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// type: 'term' = shares exact words with the answer chunk, 'para' = same meaning, different words.
// Written once, before looking at any results, and not tuned afterwards.
const CASES = [
  { q: 'What does MSP stand for and who announces it?', gold: ['msp-basics#0'], type: 'term' },
  { q: 'Does onion get a minimum support price?', gold: ['msp-basics#1'], type: 'term' },
  { q: 'I grow tomatoes, can I sell them to the government at a guaranteed rate?', gold: ['msp-basics#1'], type: 'para' },
  { q: 'Where do I check this season\'s MSP rates?', gold: ['msp-basics#3'], type: 'term' },
  { q: 'My mandi modal price is below MSP, what should I do?', gold: ['msp-basics#2'], type: 'term' },
  { q: 'What is e-NAM?', gold: ['apmc-and-enam#2'], type: 'term' },
  { q: 'How does the online bidding platform that links mandis work?', gold: ['apmc-and-enam#2'], type: 'para' },
  { q: 'What fee does the APMC charge?', gold: ['apmc-and-enam#0'], type: 'term' },
  { q: 'Are vegetables still required to be sold through APMC in Maharashtra?', gold: ['apmc-and-enam#1'], type: 'term' },
  { q: 'What should I ask my mandi before using e-NAM?', gold: ['apmc-and-enam#3'], type: 'term' },
  { q: 'How many kg is a quintal?', gold: ['reading-mandi-prices#0'], type: 'term' },
  { q: 'If the rate is 2500 per quintal, what is the price per kg?', gold: ['reading-mandi-prices#0'], type: 'term' },
  { q: 'What does modal price mean?', gold: ['reading-mandi-prices#1'], type: 'term' },
  { q: 'Why is the highest rate quoted more than what I actually got for my lot?', gold: ['reading-mandi-prices#1'], type: 'para' },
  { q: 'Why does the same crop sell for different rates in different markets?', gold: ['reading-mandi-prices#2'], type: 'para' },
  { q: 'Why did prices fall when a lot of trucks came to the market?', gold: ['reading-mandi-prices#3'], type: 'para' },
  { q: 'Should I store my crop and wait for a better price?', gold: ['storage-and-selling-timing#0'], type: 'para' },
  { q: 'How do I stop onions from rotting in storage?', gold: ['storage-and-selling-timing#1'], type: 'term' },
  { q: 'How do I store wheat and pulses so pests do not spoil them?', gold: ['storage-and-selling-timing#2'], type: 'term' },
  { q: 'Does a price rise last month mean it will rise again?', gold: ['storage-and-selling-timing#3'], type: 'para' },
  { q: 'Is it safer to sell my produce in parts?', gold: ['storage-and-selling-timing#3'], type: 'term' },
  // Not in the knowledge base: the right behaviour is to return nothing.
  { q: 'What is the weather forecast for Pune tomorrow?', gold: [], type: 'out' },
  { q: 'Who won the IPL last year?', gold: [], type: 'out' },
  { q: 'Which tractor should I buy?', gold: [], type: 'out' },
  { q: 'How do I apply for PM-KISAN?', gold: [], type: 'out' },
  { q: 'What is the capital of France?', gold: [], type: 'out' },
  { q: 'Write me a poem about farming', gold: [], type: 'out' },

  // ---- Held-out set: written AFTER the threshold was calibrated and never used to choose it. ----
  // Reported separately, so the numbers show how the settings behave on questions they were not tuned on.
  { q: 'What is the difference between MSP and the daily mandi rate?', gold: ['msp-basics#2'], type: 'para', holdout: true },
  { q: 'Which crops have a guaranteed government price?', gold: ['msp-basics#1'], type: 'para', holdout: true },
  { q: 'Do I need to register before selling on e-NAM?', gold: ['apmc-and-enam#2'], type: 'term', holdout: true },
  { q: 'Is the maximum price what an average lot will fetch?', gold: ['reading-mandi-prices#1'], type: 'term', holdout: true },
  { q: 'Do transport costs matter when choosing which market to sell in?', gold: ['reading-mandi-prices#2'], type: 'para', holdout: true },
  { q: 'What costs should I count before deciding to hold my produce?', gold: ['storage-and-selling-timing#0'], type: 'para', holdout: true },
  { q: 'How should I dry grain before keeping it?', gold: ['storage-and-selling-timing#2'], type: 'term', holdout: true },
  // Out of scope; the farming-related ones are the hard cases.
  { q: 'How much does a bag of urea fertiliser cost?', gold: [], type: 'out', holdout: true },
  { q: 'Which pesticide kills aphids on cotton?', gold: [], type: 'out', holdout: true },
  { q: 'When is the best time to sow soybean?', gold: [], type: 'out', holdout: true },
  { q: 'How do I get a crop loan from a bank?', gold: [], type: 'out', holdout: true },
  { q: 'Tell me a joke', gold: [], type: 'out', holdout: true },
  { q: 'What is the petrol price in Pune today?', gold: [], type: 'out', holdout: true },
];
const TUNING = CASES.filter((c) => !c.holdout);
const HOLDOUT = CASES.filter((c) => c.holdout);

// ---- offline stand-ins (same shape as the real embedder) ----
function hashEmbed(s, dims = 256) {
  const STOP = new Set(['the', 'a', 'an', 'is', 'of', 'to', 'and', 'in', 'for', 'what', 'does', 'do', 'how', 'it', 'on', 'or']);
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

// LangChain embeddings for the "langchain retriever" row: real Gemini via LangChain, or a hashed stand-in offline.
function langchainEmbeddings() {
  if (!OFFLINE) return createLangChainEmbeddings();
  const { Embeddings } = require('@langchain/core/embeddings');
  return new (class extends Embeddings {
    constructor() { super({}); }
    async embedQuery(t) { return hashEmbed(t); }
    async embedDocuments(ts) { return ts.map((t) => hashEmbed(t)); }
  })();
}

async function setup() {
  if (OFFLINE) {
    const { createMemoryStore } = require('../rag/store');
    const embedder = { embedDocuments: async (t) => t.map((x) => hashEmbed(x)), embedQuery: async (t) => hashEmbed(t) };
    const store = createMemoryStore();
    const dir = path.join(__dirname, '..', 'knowledge');
    const docs = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => ({ filename: f, raw: fs.readFileSync(path.join(dir, f), 'utf8') }));
    await createKnowledge({ embedder, store }).ingest(docs);
    return { embedder, store, close: async () => {} };
  }
  for (const k of ['DATABASE_URL', 'GEMINI_API_KEY']) if (!process.env[k]) { console.error(`${k} is required (or use --offline)`); process.exit(1); }
  const { Pool } = require('pg');
  const { PrismaPg } = require('@prisma/adapter-pg');
  const { PrismaClient } = require('@prisma/client');
  const { createGeminiEmbedder } = require('../rag/embeddings');
  const { createPgVectorStore } = require('../rag/store');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return {
    embedder: createGeminiEmbedder({ apiKey: process.env.GEMINI_API_KEY }),
    store: createPgVectorStore(prisma),
    close: async () => { await prisma.$disconnect(); await pool.end(); },
  };
}

// Same question is embedded by every setup: do it once.
function memoEmbedder(inner) {
  const cache = new Map();
  return {
    embedDocuments: (t) => inner.embedDocuments(t),
    embedQuery: async (q) => { if (!cache.has(q)) cache.set(q, await inner.embedQuery(q)); return cache.get(q); },
  };
}

const id = (h) => `${h.source}#${h.chunkIndex}`;
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(0)}%` : '-');

async function evaluate(name, kb, opts, cases = TUNING) {
  const per = [];
  for (const c of cases) {
    const hits = await kb.search(c.q, { topK: 5, withScoresBelowThreshold: true, ...opts });
    const ranked = hits.map(id);
    const gated = (await kb.search(c.q, { topK: 3, ...opts })).map(id);
    // Cosine similarity of the best correct chunk (answerable) or of the top result (unanswerable).
    const goldScore = Math.max(-1, ...hits.filter((h) => c.gold.includes(id(h))).map((h) => h.score));
    const topScore = hits.length ? hits[0].score : 0;
    if (opts.rerank !== false && kb.reranker && DELAY) await sleep(DELAY);
    const rank = c.gold.length ? ranked.findIndex((r) => c.gold.includes(r)) + 1 : 0; // 0 = not found
    per.push({ ...c, ranked, gated, rank, goldScore, topScore, usable: c.gold.some((g) => gated.includes(g)), refused: gated.length === 0 });
  }
  const ans = per.filter((p) => p.gold.length);
  const out = per.filter((p) => !p.gold.length);
  const byType = (t) => ans.filter((p) => p.type === t);
  return {
    name, per,
    hit1: ans.filter((p) => p.rank === 1).length, hit3: ans.filter((p) => p.rank >= 1 && p.rank <= 3).length,
    mrr: ans.reduce((s, p) => s + (p.rank ? 1 / p.rank : 0), 0) / ans.length,
    usable: ans.filter((p) => p.usable).length, n: ans.length,
    refused: out.filter((p) => p.refused).length, nOut: out.length,
    term1: [byType('term').filter((p) => p.rank === 1).length, byType('term').length],
    para1: [byType('para').filter((p) => p.rank === 1).length, byType('para').length],
  };
}

(async () => {
  const { embedder, store, close } = await setup();
  const emb = memoEmbedder(embedder);
  const reranker = OFFLINE ? null : createRerankerFromEnv();
  const base = { embedder: emb, store, log: () => {} };

  const runs = [
    await evaluate('vector', createKnowledge(base), { mode: 'vector' }),
    await evaluate('vector via LangChain', createLangChainKnowledge({ embeddings: langchainEmbeddings(), store }), {}),
    await evaluate('keyword', createKnowledge(base), { mode: 'keyword' }),
    await evaluate('hybrid (RRF)', createKnowledge(base), { mode: 'hybrid' }),
  ];
  if (reranker) runs.push(await evaluate(`hybrid + ${reranker.provider} rerank`, createKnowledge({ ...base, reranker }), { mode: 'hybrid' }));
  else if (!OFFLINE) console.log('(RERANK_API_KEY not set: skipping the rerank setup)\n');

  if (OFFLINE) console.log('OFFLINE MODE: fake hashed embeddings. This only proves the script runs; do not quote these numbers.\n');
  const n = runs[0].n;
  console.log(`${n} answerable + ${runs[0].nOut} unanswerable questions\n`);
  console.log('| Setup | Hit@1 | Hit@3 | MRR | Usable@3 | Hit@1 (exact-term Qs) | Hit@1 (paraphrase Qs) | Refusal |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const r of runs) {
    console.log(`| ${r.name} | ${pct(r.hit1, n)} | ${pct(r.hit3, n)} | ${r.mrr.toFixed(2)} | ${pct(r.usable, n)} | ${pct(...r.term1)} | ${pct(...r.para1)} | ${pct(r.refused, r.nOut)} |`);
  }

  // Threshold calibration, from the vector run (the relevance gate is a cosine cutoff).
  const vec = runs[0].per;
  const good = vec.filter((p) => p.gold.length && p.rank >= 1 && p.rank <= 3).map((p) => p.goldScore);
  const offTop = vec.filter((p) => !p.gold.length).map((p) => p.topScore);
  if (good.length && offTop.length) {
    const f = (x) => x.toFixed(2);
    console.log(`\nSimilarity scores (vector): correct chunks ${f(Math.min(...good))} to ${f(Math.max(...good))}; unanswerable questions' best hit ${f(Math.min(...offTop))} to ${f(Math.max(...offTop))}`);
    const rows = [];
    for (let t = 0.4; t <= 0.9001; t += 0.025) {
      rows.push({ t, usable: good.filter((x) => x >= t).length / good.length, refuse: offTop.filter((x) => x < t).length / offTop.length });
    }
    console.log('| RAG_MIN_SCORE | answerable kept | unanswerable refused |');
    console.log('|---|---|---|');
    for (const r of rows.filter((_, i) => i % 2 === 0)) console.log(`| ${r.t.toFixed(2)} | ${pct(Math.round(r.usable * good.length), good.length)} | ${pct(Math.round(r.refuse * offTop.length), offTop.length)} |`);
    const perfect = rows.filter((r) => r.refuse === 1);
    const pick = perfect.length ? perfect.reduce((a, b) => (b.usable > a.usable ? b : a)) : rows.reduce((a, b) => (b.usable + b.refuse > a.usable + a.refuse ? b : a));
    console.log(`\nBest cutoff on this data: RAG_MIN_SCORE=${pick.t.toFixed(2)} (keeps ${pct(Math.round(pick.usable * good.length), good.length)} of answerable, refuses ${pct(Math.round(pick.refuse * offTop.length), offTop.length)} of unanswerable).`);
    console.log(`Only ${good.length + offTop.length} questions: if the two ranges overlap, add more unanswerable questions to CASES and re-run before trusting it. Currently set: ${process.env.RAG_MIN_SCORE || '0.55 (default)'}.`);
  }

  // Held-out questions: same settings as above, nothing re-tuned.
  const heldRuns = [
    await evaluate('vector', createKnowledge(base), { mode: 'vector' }, HOLDOUT),
    await evaluate('vector via LangChain', createLangChainKnowledge({ embeddings: langchainEmbeddings(), store }), {}, HOLDOUT),
    await evaluate('hybrid (RRF)', createKnowledge(base), { mode: 'hybrid' }, HOLDOUT),
  ];
  if (reranker) heldRuns.push(await evaluate(`hybrid + ${reranker.provider} rerank`, createKnowledge({ ...base, reranker }), { mode: 'hybrid' }, HOLDOUT));
  console.log(`\nHELD-OUT (${heldRuns[0].n} answerable + ${heldRuns[0].nOut} unanswerable questions not used to pick RAG_MIN_SCORE=${process.env.RAG_MIN_SCORE || '0.55 default'}):`);
  console.log('| Setup | Hit@1 | Hit@3 | MRR | Usable@3 | Refusal |');
  console.log('|---|---|---|---|---|---|');
  for (const r of heldRuns) console.log(`| ${r.name} | ${pct(r.hit1, r.n)} | ${pct(r.hit3, r.n)} | ${r.mrr.toFixed(2)} | ${pct(r.usable, r.n)} | ${pct(r.refused, r.nOut)} |`);
  const heldLeaks = heldRuns[0].per.filter((p) => !p.gold.length && !p.refused);
  const heldLost = heldRuns[0].per.filter((p) => p.gold.length && !p.usable);
  for (const l of heldLeaks) console.log(`  vector let through (should refuse): ${l.q}  [top score ${l.topScore.toFixed(2)}]`);
  for (const l of heldLost) console.log(`  vector refused a valid question: ${l.q}  [best score ${l.goldScore.toFixed(2)}]`);

  const best = runs[runs.length - 1];
  const misses = best.per.filter((p) => p.gold.length && p.rank !== 1);
  if (misses.length) {
    console.log(`\nWhere "${best.name}" did not rank the right chunk first:`);
    for (const m of misses) console.log(`  - ${m.q}\n      want ${m.gold.join(' or ')}  got ${m.ranked.slice(0, 3).join(', ') || '(nothing)'}`);
  }
  const leaked = best.per.filter((p) => !p.gold.length && !p.refused);
  if (leaked.length) {
    console.log(`\nUnanswerable questions that still returned passages (raise RAG_MIN_SCORE?):`);
    for (const l of leaked) console.log(`  - ${l.q}  ->  ${l.gated.join(', ')}`);
  }
  await close();
})().catch((e) => { console.error(e.message); process.exit(1); });