-- =====================================================================
-- Migration 002 — Persian normalisation, full-text search, vector index
-- =====================================================================

-- ---------------------------------------------------------------------
-- normalize_fa(): THE single normalisation function.
-- Every write to *_norm columns and every incoming query goes through it.
-- Deterministic SQL — never delegate this to an LLM.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION normalize_fa(t TEXT) RETURNS TEXT AS $$
DECLARE r TEXT;
BEGIN
  IF t IS NULL THEN RETURN NULL; END IF;
  r := t;

  -- Arabic yeh/kaf -> Persian
  r := translate(r, U&'\064A\0643\06C0\0649', U&'\06CC\06A9\0647\06CC');

  -- Arabic-Indic and Extended Arabic-Indic digits -> ASCII
  r := translate(r, U&'\0660\0661\0662\0663\0664\0665\0666\0667\0668\0669', '0123456789');
  r := translate(r, U&'\06F0\06F1\06F2\06F3\06F4\06F5\06F6\06F7\06F8\06F9', '0123456789');

  -- strip harakat / tatweel
  r := regexp_replace(r, U&'[\064B-\0652\0640\0670]', '', 'g');

  -- ZWNJ (نیم‌فاصله) -> plain space, then collapse whitespace
  r := replace(r, U&'\200C', ' ');
  r := replace(r, U&'\200F', ' ');
  r := replace(r, U&'\200E', ' ');
  r := regexp_replace(r, '\s+', ' ', 'g');

  RETURN btrim(lower(r));
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- ---------------------------------------------------------------------
-- Text search configuration.
-- 'simple' + normalize_fa is intentional: Postgres ships no Persian
-- stemmer, and a wrong stemmer is worse than none for legal terms
-- (واخواهی vs تجدیدنظرخواهی must NOT collapse).
-- ---------------------------------------------------------------------

CREATE TEXT SEARCH CONFIGURATION fa (COPY = simple);

CREATE INDEX idx_chunk_fts
  ON service_chunk USING GIN (to_tsvector('fa', text_norm));

CREATE INDEX idx_chunk_trgm
  ON service_chunk USING GIN (text_norm gin_trgm_ops);

-- HNSW for cosine similarity. Tune m/ef_construction after first 5k chunks.
CREATE INDEX idx_chunk_vec
  ON service_chunk USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_chunk_service ON service_chunk(service_id);

-- ---------------------------------------------------------------------
-- Alias / title search on the service table itself
-- ---------------------------------------------------------------------

CREATE INDEX idx_service_aliases ON service USING GIN (aliases);
CREATE INDEX idx_service_title_trgm
  ON service USING GIN (normalize_fa(title_fa) gin_trgm_ops);
CREATE INDEX idx_service_status ON service(status) WHERE is_active;

-- ---------------------------------------------------------------------
-- hybrid_search(): BM25-ish lexical + vector, fused with RRF (k = 60).
-- Returns candidates only; ranking/《which service》 is decided by the
-- router prompt on top of these rows.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION hybrid_search(
  q            TEXT,
  q_embedding  VECTOR(1024),
  match_limit  INT DEFAULT 30,
  rrf_k        INT DEFAULT 60
)
RETURNS TABLE (chunk_id BIGINT, service_id UUID, score DOUBLE PRECISION) AS $$
WITH nq AS (SELECT normalize_fa(q) AS t),
lex AS (
  SELECT c.id, c.service_id,
         ROW_NUMBER() OVER (
           ORDER BY ts_rank_cd(to_tsvector('fa', c.text_norm),
                               plainto_tsquery('fa', (SELECT t FROM nq))) DESC
         ) AS rnk
  FROM service_chunk c
  JOIN service s ON s.id = c.service_id
  WHERE s.is_active AND s.status = 'approved'
    AND to_tsvector('fa', c.text_norm) @@ plainto_tsquery('fa', (SELECT t FROM nq))
  LIMIT 100
),
vec AS (
  SELECT c.id, c.service_id,
         ROW_NUMBER() OVER (ORDER BY c.embedding <=> q_embedding) AS rnk
  FROM service_chunk c
  JOIN service s ON s.id = c.service_id
  WHERE s.is_active AND s.status = 'approved'
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> q_embedding
  LIMIT 100
)
SELECT COALESCE(lex.id, vec.id)                AS chunk_id,
       COALESCE(lex.service_id, vec.service_id) AS service_id,
       COALESCE(1.0 / (rrf_k + lex.rnk), 0)
     + COALESCE(1.0 / (rrf_k + vec.rnk), 0)     AS score
FROM lex FULL OUTER JOIN vec ON lex.id = vec.id
ORDER BY score DESC
LIMIT match_limit;
$$ LANGUAGE sql STABLE;
