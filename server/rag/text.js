// Keyword-search helpers shared by the Postgres and in-memory stores.

const STOPWORDS = new Set((
  'a an the is are was were be been am do does did done have has had having i me my we our you your it its ' +
  'this that these those of to in on at for from by with about as into than then so if or and but not no can ' +
  'could should would will shall may might must what which who whom whose when where why how there here ' +
  'tell give show please any some more most much many very also just get got'
).split(' '));

// "does onion have MSP?" -> ["onion", "msp"]. Letters and digits only, so the result is safe to
// put into a tsquery (no operators can get through).
function keywordTerms(query, max = 12) {
  const seen = new Set();
  const out = [];
  for (const w of String(query || '').toLowerCase().match(/[a-z0-9]+/g) || []) {
    if (w.length < 2 || STOPWORDS.has(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= max) break;
  }
  return out;
}

// Very light stemmer, only for the in-memory BM25 (Postgres stems with its own 'english' config).
const stem = (w) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w);
const tokens = (text) => (String(text).toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 1 && !STOPWORDS.has(w)).map(stem);

// Okapi BM25 over a list of { text }. Returns a score per doc (0 = no query term present).
function bm25(docs, queryTerms, { k1 = 1.2, b = 0.75 } = {}) {
  const q = [...new Set(queryTerms.map(stem))];
  const toks = docs.map((d) => tokens(d.text));
  const avg = toks.reduce((s, t) => s + t.length, 0) / (toks.length || 1) || 1;
  const df = new Map(q.map((t) => [t, toks.filter((ts) => ts.includes(t)).length]));
  return toks.map((ts) => {
    let score = 0;
    for (const t of q) {
      const f = ts.filter((x) => x === t).length;
      if (!f) continue;
      const idf = Math.log(1 + (docs.length - df.get(t) + 0.5) / (df.get(t) + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * ts.length) / avg)));
    }
    return score;
  });
}

module.exports = { keywordTerms, bm25, STOPWORDS };