// The RAG pipeline: ingest (chunk -> embed -> store) and search (embed query -> nearest chunks).

const { parseDoc, chunkDoc } = require('./chunk');

// Below this cosine similarity a hit is treated as "not in the knowledge base", so the
// agent says it doesn't know instead of answering from an irrelevant passage.
// Tune with RAG_MIN_SCORE after looking at real scores (run `npm run ingest -- --query "..."`).
const DEFAULT_MIN_SCORE = Number(process.env.RAG_MIN_SCORE) || 0.55;

function createKnowledge({ embedder, store, minScore = DEFAULT_MIN_SCORE }) {
  return {
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

    async search(query, { topK = 3, withScoresBelowThreshold = false } = {}) {
      const vector = await embedder.embedQuery(query);
      const hits = await store.search(vector, topK);
      return withScoresBelowThreshold ? hits : hits.filter((h) => h.score >= minScore);
    },
  };
}

module.exports = { createKnowledge, DEFAULT_MIN_SCORE };