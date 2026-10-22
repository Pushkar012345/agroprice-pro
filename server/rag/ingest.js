// Load knowledge/*.md into pgvector:   cd server && npm run ingest
// Try a query and see raw scores:       npm run ingest -- --query "what is MSP"
// Needs DATABASE_URL and GEMINI_API_KEY in server/.env.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const { createGeminiEmbedder } = require('./embeddings');
const { createPgVectorStore } = require('./store');
const { createKnowledge } = require('./knowledge');

const DIR = path.join(__dirname, '..', 'knowledge');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const kb = createKnowledge({
    embedder: createGeminiEmbedder({ apiKey: process.env.GEMINI_API_KEY }),
    store: createPgVectorStore(prisma),
  });

  const qi = process.argv.indexOf('--query');
  if (qi !== -1) {
    const hits = await kb.search(process.argv[qi + 1] || '', { topK: 5, withScoresBelowThreshold: true });
    hits.forEach((h) => console.log(`${h.score.toFixed(3)}  [${h.source}#${h.chunkIndex}]  ${h.content.slice(0, 80).replace(/\n/g, ' ')}...`));
  } else {
    const docs = fs.readdirSync(DIR).filter((f) => f.endsWith('.md'))
      .map((f) => ({ filename: f, raw: fs.readFileSync(path.join(DIR, f), 'utf8') }));
    const summary = await kb.ingest(docs);
    summary.forEach((s) => console.log(`ingested ${s.source}: ${s.chunks} chunk(s)`));
    console.log(`done: ${summary.reduce((n, s) => n + s.chunks, 0)} chunks from ${summary.length} files`);
  }
  await prisma.$disconnect();
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });