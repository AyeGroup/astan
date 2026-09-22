-- =====================================================================
-- Migration 003 — application layer: staff roles, court directory,
-- service↔rule linkage, idempotency keys for the indexer.
--
-- Everything here is additive to the contract in 001/002. No column in
-- this file stores, or could store, a government-system credential.
-- See ENGINEERING_RULES.md §1.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Staff / back-office identities.
--
-- Deliberately separate from app_user: an end user is identified by an
-- HMAC of their mobile number and never carries a role. Only a row here
-- can approve content, and only with 'legal_reviewer' in roles.
-- ---------------------------------------------------------------------
CREATE TABLE staff_user (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,          -- PBKDF2-HMAC-SHA256, see security.py
  roles         TEXT[] NOT NULL DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_roles_known CHECK (
    roles <@ ARRAY['admin','editor','legal_reviewer']::TEXT[]
  )
);

-- ---------------------------------------------------------------------
-- Which deadline rules a service card should surface.
-- The card links to the rule; it never carries the number itself.
-- ---------------------------------------------------------------------
CREATE TABLE service_deadline_rule (
  service_id UUID   NOT NULL REFERENCES service(id) ON DELETE CASCADE,
  rule_id    BIGINT NOT NULL REFERENCES deadline_rule(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, rule_id)
);

-- ---------------------------------------------------------------------
-- Court / judicial-authority directory  (GET /courts/search)
-- ---------------------------------------------------------------------
CREATE TABLE court (
  id         BIGSERIAL PRIMARY KEY,
  name_fa    TEXT NOT NULL,
  kind       TEXT,                      -- dadgostari | divan | dadsara | shora
  province   TEXT,
  city       TEXT,
  address    TEXT,
  phone      TEXT,
  UNIQUE (name_fa, city)
);

CREATE INDEX idx_court_name_trgm
  ON court USING GIN (normalize_fa(name_fa) gin_trgm_ops);
CREATE INDEX idx_court_province ON court(province);

-- ---------------------------------------------------------------------
-- Re-index queue (T-101): a service edit enqueues, the worker drains.
-- ---------------------------------------------------------------------
CREATE TABLE reindex_queue (
  service_id   UUID PRIMARY KEY REFERENCES service(id) ON DELETE CASCADE,
  enqueued_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts     INT NOT NULL DEFAULT 0,
  last_error   TEXT
);

CREATE OR REPLACE FUNCTION enqueue_reindex() RETURNS TRIGGER AS $$
DECLARE sid UUID;
BEGIN
  sid := COALESCE(NEW.service_id, OLD.service_id);
  IF sid IS NOT NULL THEN
    INSERT INTO reindex_queue (service_id) VALUES (sid)
    ON CONFLICT (service_id) DO UPDATE
      SET enqueued_at = now(), attempts = 0, last_error = NULL;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enqueue_reindex_self() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO reindex_queue (service_id) VALUES (COALESCE(NEW.id, OLD.id))
  ON CONFLICT (service_id) DO UPDATE
    SET enqueued_at = now(), attempts = 0, last_error = NULL;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER service_reindex  AFTER INSERT OR UPDATE ON service
  FOR EACH ROW EXECUTE FUNCTION enqueue_reindex_self();
CREATE TRIGGER step_reindex     AFTER INSERT OR UPDATE OR DELETE ON step
  FOR EACH ROW EXECUTE FUNCTION enqueue_reindex();
CREATE TRIGGER doc_reindex      AFTER INSERT OR UPDATE OR DELETE ON required_document
  FOR EACH ROW EXECUTE FUNCTION enqueue_reindex();
CREATE TRIGGER faq_reindex      AFTER INSERT OR UPDATE OR DELETE ON faq
  FOR EACH ROW EXECUTE FUNCTION enqueue_reindex();
CREATE TRIGGER fee_reindex      AFTER INSERT OR UPDATE OR DELETE ON fee
  FOR EACH ROW EXECUTE FUNCTION enqueue_reindex();

-- ---------------------------------------------------------------------
-- Chunk identity. The indexer upserts on (service_id, section, ord) so
-- a re-index never duplicates and never churns unchanged embeddings.
-- ---------------------------------------------------------------------
ALTER TABLE service_chunk ADD COLUMN ord INT NOT NULL DEFAULT 0;
ALTER TABLE service_chunk ADD COLUMN source_ref TEXT;
ALTER TABLE service_chunk ADD COLUMN content_hash TEXT;
ALTER TABLE service_chunk ADD CONSTRAINT service_chunk_identity
  UNIQUE (service_id, section, ord);

-- ---------------------------------------------------------------------
-- answer_log: router calls are logged too, so refusals and routing
-- decisions share one audit trail (ENGINEERING_RULES.md §4).
-- ---------------------------------------------------------------------
ALTER TABLE answer_log ADD COLUMN kind TEXT NOT NULL DEFAULT 'ask'
  CHECK (kind IN ('ask','route'));
ALTER TABLE answer_log ADD COLUMN model_called BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE answer_log ADD COLUMN top_score DOUBLE PRECISION;
CREATE INDEX idx_answer_log_created ON answer_log(created_at DESC);

-- ---------------------------------------------------------------------
-- A rule edit must be able to find its live instances (T-203).
-- ---------------------------------------------------------------------
CREATE INDEX idx_deadline_instance_rule ON deadline_instance(rule_id)
  WHERE superseded_by IS NULL;
CREATE INDEX idx_reminder_pending ON reminder(fire_at) WHERE sent_at IS NULL;
CREATE INDEX idx_eblagh_event_case ON eblagh_event(case_id);
CREATE INDEX idx_user_case_user ON user_case(user_id);

-- ---------------------------------------------------------------------
-- Stale content falls out of retrieval by itself (ENGINEERING_RULES.md §2).
-- service_public is the only table public queries may read; this view
-- adds the review_due_at horizon on top of it.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW service_servable AS
  SELECT s.*,
         (s.review_due_at IS NOT NULL AND s.review_due_at < now()) AS needs_review
  FROM service_public s;
