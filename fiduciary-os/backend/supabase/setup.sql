-- fiduciary-os Supabase setup
-- Run once after creating the Supabase project, before `prisma migrate dev`.

-- Extensions ----------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgvector";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Row-Level Security --------------------------------------------------------
-- Users may only see their own rows.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_row" ON users
  USING (auth.uid()::text = id);

-- AI interactions: readable only by the interaction owner.
ALTER TABLE ai_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_interactions_own" ON ai_interactions
  USING (auth.uid()::text = "userId");

-- Ledger entries are immutable audit records; service-role only for writes.
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ledger_service_role_only" ON ledger_entries
  USING (auth.role() = 'service_role');

-- Embeddings: readable only by the embedding owner.
ALTER TABLE embedding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "embedding_own" ON embedding
  USING (
    EXISTS (
      SELECT 1 FROM ai_interactions
      WHERE ai_interactions.id = embedding."entityId"
        AND ai_interactions."userId" = auth.uid()::text
    )
  );

-- pgvector index on the embeddings table ------------------------------------
-- Lists = 100 is a good starting point for ≤1M rows; tune to sqrt(row_count).
CREATE INDEX IF NOT EXISTS embedding_vector_idx
  ON embedding
  USING ivfflat (vector vector_cosine_ops)
  WITH (lists = 100);

-- TimescaleDB hypertable (optional — enable if the TimescaleDB extension is on)
-- SELECT create_hypertable('ai_interactions', 'created_at');
