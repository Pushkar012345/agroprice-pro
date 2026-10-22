-- pgvector (available on Supabase; enable once per database)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(768) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeChunk_source_chunkIndex_key" ON "KnowledgeChunk"("source", "chunkIndex");
CREATE INDEX "KnowledgeChunk_source_idx" ON "KnowledgeChunk"("source");

-- Approximate nearest-neighbour index for cosine distance
CREATE INDEX "KnowledgeChunk_embedding_idx" ON "KnowledgeChunk" USING hnsw ("embedding" vector_cosine_ops);