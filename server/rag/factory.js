// Builds the knowledge base (embedder + store + optional reranker) from environment variables.
// Returns undefined when GEMINI_API_KEY is missing: RAG is optional everywhere.

function createKnowledgeFromEnv(prisma, env = process.env) {
  if (!env.GEMINI_API_KEY) return undefined;
  const { createGeminiEmbedder } = require('./embeddings');
  const { createPgVectorStore } = require('./store');
  const { createKnowledge } = require('./knowledge');
  const { createRerankerFromEnv } = require('./rerank');
  return createKnowledge({
    embedder: createGeminiEmbedder({ apiKey: env.GEMINI_API_KEY }),
    store: createPgVectorStore(prisma),
    reranker: createRerankerFromEnv(env),
  });
}

module.exports = { createKnowledgeFromEnv };