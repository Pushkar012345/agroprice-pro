// Vector stores. Same interface, two implementations:
//   upsertSource(source, rows)  replace all chunks of one source file
//   search(vector, k)           nearest chunks by cosine similarity (score 0..1, higher = closer)
// rows: { title, url, chunkIndex, content, embedding }

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
    get size() { return items.length; },
  };
}

module.exports = { createPgVectorStore, createMemoryStore };