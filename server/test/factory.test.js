const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeFromEnv } = require('../rag/factory');

test('knowledge factory: no GEMINI_API_KEY means no knowledge base', () => {
  assert.equal(createKnowledgeFromEnv({}, {}), undefined);
  assert.equal(createKnowledgeFromEnv({}, { GEMINI_API_KEY: '' }), undefined);
});

test('knowledge factory: builds a search-capable knowledge base, with a reranker only if configured', () => {
  const kb = createKnowledgeFromEnv({}, { GEMINI_API_KEY: 'k' });
  assert.equal(typeof kb.search, 'function');
  assert.equal(kb.reranker, null);
  const kb2 = createKnowledgeFromEnv({}, { GEMINI_API_KEY: 'k', RERANK_API_KEY: 'r', RERANK_PROVIDER: 'cohere' });
  assert.equal(kb2.reranker.provider, 'cohere');
});