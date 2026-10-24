// Vector stores. Same interface, two implementations:
//   upsertSource(source, rows)  replace all chunks of one source file
//   search(vector, k)           nearest chunks by cosine similarity (score 0..1, higher = closer)
//   searchText(query, k, vector) chunks matching the query WORDS (keyword search), best first.
//                               Every hit still carries its cosine `score` against `vector`, so the
//                               relevance threshold can be applied to keyword hits as well.
// rows: { title, url, chunkIndex, content, embedding }

const { keywordTerms, bm25 } = require('./text');

const toLiteral = (vec) => {
  if (!Array.isArray(vec) || !vec.every(Number.isFinite)) throw new Error('invalid embedding');
  return `[${vec.join(',')}]`;
};

// Postgres + pgvector. Values are bound as parameters; only the ::vector cast is inline.
function createPgVectorStore(prisma) {
  return {
    async upsertSource(source, rows) {
      await prisma.$transaction([
        prisma.$executeRaw`DELETE FROM "KnowledgeChunk" WHERE source = ${source}`,
        ...rows.map((r) => prisma.$executeRaw`
          INSERT INTO "KnowledgeChunk" (source, title, url, "chunkIndex", content, embedding)
          VALUES (${source}, ${r.title}, ${r.url ?? null}, ${r.chunkIndex}, ${r.content}, ${toLiteral(r.embedding)}::vector)`),
      ]);
    },
    async search(vector, k) {
      const lit = toLiteral(vector);
      const rows = await prisma.$queryRaw`
        SELECT source, title, url, "chunkIndex", content,
               1 - (embedding <=> ${lit}::vector) AS score
        FROM "KnowledgeChunk"
        ORDER BY embedding <=> ${lit}::vector
        LIMIT ${k}`;
      return rows.map((r) => ({ ...r, score: Number(r.score) }));
    },
    // Postgres full-text search: stemmed words OR-ed together, ranked by ts_rank_cd over the generated
    // "search_tsv" column (GIN index, see the add_knowledge_fts migration). Terms are letters/digits
    // only (keywordTerms), so the tsquery text cannot contain operators.
    async searchText(query, k, vector) {
      const terms = keywordTerms(query);
      if (terms.length === 0) return [];
      const tsq = terms.join(' | ');
      const lit = toLiteral(vector);
      const rows = await prisma.$queryRaw`
        SELECT c.source, c.title, c.url, c."chunkIndex", c.content,
               1 - (c.embedding <=> ${lit}::vector) AS score
        FROM "KnowledgeChunk" c, to_tsquery('english', ${tsq}) q
        WHERE c.search_tsv @@ q
        ORDER BY ts_rank_cd(c.search_tsv, q) DESC, c.source, c."chunkIndex"
        LIMIT ${k}`;
      return rows.map((r) => ({ ...r, score: Number(r.score) }));
    },
  };
}

// In-memory store for tests and offline demos (vectors are unit length, so dot = cosine).
function createMemoryStore() {
  let items = [];
  return {
    async upsertSource(source, rows) {
      items = items.filter((i) => i.source !== source).concat(rows.map((r) => ({ source, ...r })));
    },
    async search(vector, k) {
      return items
        .map((i) => ({ ...i, score: i.embedding.reduce((s, x, n) => s + x * vector[n], 0) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k)
        .map(({ embedding, ...rest }) => rest);
    },
    // BM25 over title + content (Postgres has no BM25, so this is the closest in-memory equivalent).
    async searchText(query, k, vector) {
      const terms = keywordTerms(query);
      if (terms.length === 0) return [];
      const scores = bm25(items.map((i) => ({ text: `${i.title}\n${i.content}` })), terms);
      return items
        .map((i, n) => ({ i, bm: scores[n] }))
        .filter((x) => x.bm > 0)
        .sort((a, b) => b.bm - a.bm)
        .slice(0, k)
        .map(({ i }) => {
          const { embedding, ...rest } = i;
          return { ...rest, score: embedding.reduce((sum, x, n) => sum + x * vector[n], 0) };
        });
    },
    get size() { return items.length; },
  };
}

module.exports = { createPgVectorStore, createMemoryStore };