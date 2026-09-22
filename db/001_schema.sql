-- =====================================================================
-- Daadno Judicial Services Navigator — Core schema
-- PostgreSQL 15+  |  extensions: pgvector, pg_trgm, unaccent
-- Migration 001 — catalog + user domain
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------
-- ENUM types
-- ---------------------------------------------------------------------

CREATE TYPE persona_t AS ENUM (
  'haqiqi',              -- شخص حقیقی
  'hoquqi',              -- شخص حقوقی
  'vakil',               -- وکیل
  'karshenas',           -- کارشناس رسمی
  'danesh_hoquqi'        -- دارنده دانش حقوقی
);

CREATE TYPE channel_t AS ENUM (
  'self_service',        -- خودکاربری
  'edmat_office',        -- دفتر خدمات الکترونیک قضایی
  'judicial_unit',       -- مراجعه حضوری به واحد قضایی
  'postal'
);

CREATE TYPE verify_status_t AS ENUM (
  'draft',
  'needs_legal_review',
  'approved',
  'stale'                -- approved but past review_due_at
);

CREATE TYPE fee_basis_t AS ENUM ('fixed', 'percentage', 'tariff_table', 'free');

CREATE TYPE prereq_t AS ENUM ('hard', 'soft');

CREATE TYPE count_from_t AS ENUM ('day_of_eblagh', 'day_after_eblagh');

CREATE TYPE residency_t AS ENUM ('inside_iran', 'outside_iran', 'any');

-- ---------------------------------------------------------------------
-- Reference: hosting systems (سامانه‌های عدل ایران)
-- ---------------------------------------------------------------------

CREATE TABLE judicial_system (
  id            SERIAL PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name_fa       TEXT NOT NULL,
  url           TEXT,
  owner_org     TEXT,
  login_method  TEXT,                      -- e.g. 'sana'
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Core: service
-- ---------------------------------------------------------------------

CREATE TABLE service (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug           TEXT NOT NULL UNIQUE,
  title_fa       TEXT NOT NULL,
  aliases        TEXT[] NOT NULL DEFAULT '{}',   -- ثنا / سنا / sana / ثبت نام قضایی
  summary        TEXT NOT NULL,                  -- «این خدمت به درد چه کسی و چه وقت می‌خورد»
  system_id      INT REFERENCES judicial_system(id),
  category       TEXT NOT NULL,                  -- registration | notification | filing | inquiry | payment | appointment
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,

  -- editorial trust signals (see ENGINEERING_RULES.md §2)
  status         verify_status_t NOT NULL DEFAULT 'draft',
  verified_at    TIMESTAMPTZ,
  verified_by    TEXT,
  review_due_at  TIMESTAMPTZ,                    -- verified_at + 90d, set by trigger
  confidence     SMALLINT NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A service is only servable to end users when legally signed off.
CREATE OR REPLACE VIEW service_public AS
  SELECT * FROM service
  WHERE is_active AND status = 'approved';

-- Immutable version history. Every admin write appends one row.
CREATE TABLE service_version (
  id            BIGSERIAL PRIMARY KEY,
  service_id    UUID NOT NULL REFERENCES service(id) ON DELETE CASCADE,
  version       INT NOT NULL,
  payload       JSONB NOT NULL,        -- full denormalised snapshot of the service card
  changelog     TEXT,
  author        TEXT NOT NULL,
  published_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_id, version)
);

-- ---------------------------------------------------------------------
-- Service detail tables
-- ---------------------------------------------------------------------

CREATE TABLE persona_eligibility (
  service_id       UUID NOT NULL REFERENCES service(id) ON DELETE CASCADE,
  persona          persona_t NOT NULL,
  allowed          BOOLEAN NOT NULL,
  restriction_note TEXT,               -- «ثبت شکواییه برای این نقش مجاز نیست»
  PRIMARY KEY (service_id, persona)
);

CREATE TABLE service_channel (
  id          BIGSERIAL PRIMARY KEY,
  service_id  UUID NOT NULL REFERENCES service(id) ON DELETE CASCADE,
  kind        channel_t NOT NULL,
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  deep_link   TEXT,
  note        TEXT,
  UNIQUE (service_id, kind)
);

CREATE TABLE prerequisite (
  service_id           UUID NOT NULL REFERENCES service(id) ON DELETE CASCADE,
  depends_on_service_id UUID NOT NULL REFERENCES service(id) ON DELETE CASCADE,
  kind                 prereq_t NOT NULL DEFAULT 'hard',
  note                 TEXT,
  PRIMARY KEY (service_id, depends_on_service_id),
  CHECK (service_id <> depends_on_service_id)
);

CREATE TABLE step (
  id            BIGSERIAL PRIMARY KEY,
  service_id    UUID NOT NULL REFERENCES service(id) ON DELETE CASCADE,
  ord           INT NOT NULL,
  title         TEXT NOT NULL,
  body_md       TEXT NOT NULL,
  screen_hint   TEXT,       -- «در منوی سمت راست، گزینه ...»
  common_error  TEXT,       -- highest-value field in the schema; see PRD §M3
  UNIQUE (service_id, ord)
);

CREATE TABLE required_document (
  id                    BIGSERIAL PRIMARY KEY,
  service_id            UUID NOT NULL REFERENCES service(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  is_mandatory          BOOLEAN NOT NULL DEFAULT TRUE,
  format_note           TEXT,     -- «اسکن رنگی، حداکثر ۵۰۰ کیلوبایت»
  where_to_get_service_id UUID REFERENCES service(id)
);

CREATE TABLE fee (
  id           BIGSERIAL PRIMARY KEY,
  service_id   UUID NOT NULL REFERENCES service(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  basis        fee_basis_t NOT NULL,
  formula      JSONB,             -- {"type":"percentage","of":"khaste","rate":0.035,"min":...,"max":...}
  as_of_year   SMALLINT NOT NULL, -- Jalali year, e.g. 1405
  legal_ref_id BIGINT,
  status       verify_status_t NOT NULL DEFAULT 'needs_legal_review'
);

CREATE TABLE legal_ref (
  id          BIGSERIAL PRIMARY KEY,
  service_id  UUID REFERENCES service(id) ON DELETE CASCADE,
  law_title   TEXT NOT NULL,
  article     TEXT NOT NULL,
  quote       TEXT,
  url         TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE fee
  ADD CONSTRAINT fee_legal_ref_fk
  FOREIGN KEY (legal_ref_id) REFERENCES legal_ref(id);

CREATE TABLE faq (
  id                 BIGSERIAL PRIMARY KEY,
  service_id         UUID NOT NULL REFERENCES service(id) ON DELETE CASCADE,
  question           TEXT NOT NULL,
  answer_md          TEXT NOT NULL,
  search_volume_hint INT,          -- filled from Search Console, not guessed
  status             verify_status_t NOT NULL DEFAULT 'draft'
);

-- ---------------------------------------------------------------------
-- Deadline engine
-- ---------------------------------------------------------------------

CREATE TABLE eblagh_type (
  id        SERIAL PRIMARY KEY,
  code      TEXT NOT NULL UNIQUE,   -- raye_badvi | ahzariyeh | dadnameh | qarar | ekhtariyeh
  title_fa  TEXT NOT NULL
);

CREATE TABLE deadline_rule (
  id              BIGSERIAL PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,     -- tajdidnazar_hoquqi
  title_fa        TEXT NOT NULL,
  trigger_type_id INT NOT NULL REFERENCES eblagh_type(id),

  duration_value  INT,                      -- NULL until legal sign-off. Never hardcode.
  duration_unit   TEXT NOT NULL DEFAULT 'day' CHECK (duration_unit IN ('day','month')),
  residency       residency_t NOT NULL DEFAULT 'inside_iran',
  count_from      count_from_t NOT NULL DEFAULT 'day_after_eblagh',
  skip_holidays   BOOLEAN NOT NULL DEFAULT FALSE,
  extend_if_ends_on_holiday BOOLEAN NOT NULL DEFAULT TRUE,

  legal_ref_id    BIGINT REFERENCES legal_ref(id),
  as_of_year      SMALLINT NOT NULL,
  status          verify_status_t NOT NULL DEFAULT 'needs_legal_review',
  approved_by     TEXT,
  approved_at     TIMESTAMPTZ,

  -- HARD GATE: an approved rule must carry a number and a legal source.
  CONSTRAINT rule_approved_is_complete CHECK (
    status <> 'approved'
    OR (duration_value IS NOT NULL AND legal_ref_id IS NOT NULL AND approved_by IS NOT NULL)
  )
);

CREATE TABLE holiday (
  d          DATE PRIMARY KEY,           -- Gregorian; Jalali conversion in app layer
  title_fa   TEXT NOT NULL,
  is_official BOOLEAN NOT NULL DEFAULT TRUE,
  source     TEXT
);

-- ---------------------------------------------------------------------
-- User domain
-- ---------------------------------------------------------------------

CREATE TABLE app_user (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_hash  TEXT NOT NULL UNIQUE,       -- HMAC of mobile; raw number never stored
  display_name TEXT,
  locale      TEXT NOT NULL DEFAULT 'fa-IR',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

-- NOTE: there is deliberately NO column for Sana credentials anywhere
-- in this schema. See ENGINEERING_RULES.md §1. CI asserts this.

CREATE TABLE user_case (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,              -- user-chosen, e.g. «پرونده چک»
  case_number  TEXT,                       -- optional, user-entered
  court_name   TEXT,
  is_closed    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  purge_after  TIMESTAMPTZ                 -- auto-delete for closed cases
);

CREATE TABLE eblagh_event (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id        UUID NOT NULL REFERENCES user_case(id) ON DELETE CASCADE,
  eblagh_type_id INT NOT NULL REFERENCES eblagh_type(id),
  seen_at        DATE NOT NULL,            -- تاریخ رؤیت در سامانه ابلاغ، وارد‌شده توسط کاربر
  residency      residency_t NOT NULL DEFAULT 'inside_iran',
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE deadline_instance (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  eblagh_event_id UUID NOT NULL REFERENCES eblagh_event(id) ON DELETE CASCADE,
  rule_id         BIGINT NOT NULL REFERENCES deadline_rule(id),
  rule_snapshot   JSONB NOT NULL,          -- frozen copy of the rule at compute time
  expires_on      DATE NOT NULL,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded_by   UUID REFERENCES deadline_instance(id),
  user_notified_of_change BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE reminder (
  id                  BIGSERIAL PRIMARY KEY,
  deadline_instance_id UUID NOT NULL REFERENCES deadline_instance(id) ON DELETE CASCADE,
  fire_at             TIMESTAMPTZ NOT NULL,
  channel             TEXT NOT NULL CHECK (channel IN ('push','sms','email')),
  sent_at             TIMESTAMPTZ,
  UNIQUE (deadline_instance_id, fire_at, channel)
);

CREATE TABLE draft_document (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  case_id     UUID REFERENCES user_case(id) ON DELETE SET NULL,
  template_code TEXT NOT NULL,             -- shekvaiyeh | dadkhast | layehe | ezharnameh
  fields      JSONB NOT NULL,
  body_md     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Retrieval + observability
-- ---------------------------------------------------------------------

CREATE TABLE service_chunk (
  id          BIGSERIAL PRIMARY KEY,
  service_id  UUID NOT NULL REFERENCES service(id) ON DELETE CASCADE,
  section     TEXT NOT NULL,               -- summary | step | document | faq | fee
  text        TEXT NOT NULL,
  text_norm   TEXT NOT NULL,               -- output of normalize_fa(), see 002
  embedding   VECTOR(1024),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every answer served is logged with what it was grounded on.
CREATE TABLE answer_log (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES app_user(id) ON DELETE SET NULL,
  session_id    TEXT NOT NULL,
  question      TEXT NOT NULL,
  question_norm TEXT NOT NULL,
  retrieved_chunk_ids BIGINT[] NOT NULL,
  chosen_service_id UUID REFERENCES service(id),
  chosen_channel  channel_t,
  answer_md     TEXT NOT NULL,
  model         TEXT NOT NULL,
  latency_ms    INT,
  refused       BOOLEAN NOT NULL DEFAULT FALSE,
  refusal_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER service_touch BEFORE UPDATE ON service
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE OR REPLACE FUNCTION set_review_due() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.verified_at IS NOT NULL AND
     (OLD.verified_at IS DISTINCT FROM NEW.verified_at) THEN
    NEW.review_due_at := NEW.verified_at + INTERVAL '90 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER service_review_due BEFORE INSERT OR UPDATE ON service
  FOR EACH ROW EXECUTE FUNCTION set_review_due();
