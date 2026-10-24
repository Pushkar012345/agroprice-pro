// Builds the knowledge base from environment variables.
// Returns undefined when GEMINI_API_KEY is missing: RAG is optional everywhere.
//
//   RAG_ENGINE=native      (default) rag/knowledge.js: vector / keyword / hybrid + optional reranker
//   RAG_ENGINE=langchain   rag/langchain-retriever.js: LangChain BaseRetriever + GoogleGenerativeAIEmbeddings (vector search)
// Ingestion (npm run ingest) always uses the native embedder, so both engines read the same stored vectors.

function createKnowledgeFromEnv(prisma, env = process.env) {
  if (!env.GEMINI_API_KEY) return undefined;
  const { createPgVectorStore } = require('./store');
  const store = createPgVectorStore(prisma);

  if ((env.RAG_ENGINE || '').toLowerCase() === 'langchain') {
    const { createLangChainEmbeddings, createLangChainKnowledge } = require('./langchain-retriever');
    return createLangChainKnowledge({ embeddings: createLangChainEmbeddings({ apiKey: env.GEMINI_API_KEY }), store });
  }

  const { createGeminiEmbedder } = require('./embeddings');
  const { createKnowledge } = require('./knowledge');
  const { createRerankerFromEnv } = require('./rerank');
  return createKnowledge({
    embedder: createGeminiEmbedder({ apiKey: env.GEMINI_API_KEY }),
    store,
    reranker: createRerankerFromEnv(env),
  });
}

module.exports = { createKnowledgeFromEnv };