-- Keyword (full-text) search next to the vector search, for hybrid retrieval.
-- A generated column keeps itself in sync with title/content, so ingest needs no change and
-- existing rows are backfilled automatically when the column is added.
ALTER TABLE "KnowledgeChunk"
  ADD COLUMN "search_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce("title", '') || ' ' || "content")) STORED;

CREATE INDEX "KnowledgeChunk_search_tsv_idx" ON "KnowledgeChunk" USING GIN ("search_tsv");