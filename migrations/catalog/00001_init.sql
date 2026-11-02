-- Catalog schema: game sheets built from barcodes.
-- Adapted from the original init.sql (see docs/adr/0005-postgres-un-schema-par-module.md):
--   * everything lives in the "catalog" schema, owned by the catalog module only;
--   * BIGSERIAL -> BIGINT GENERATED ALWAYS AS IDENTITY;
--   * games gains categories / image_url / art_key required by the API contract;
--   * generation_queue gains locked_until (worker lease);
--   * generation_attempts is new (audit + daily budget);
--   * barcode_submissions and game_reports come later, with their endpoints.

-- +goose Up
CREATE SCHEMA IF NOT EXISTS catalog;

-- ============================================================
-- Types
-- ============================================================

CREATE TYPE catalog.barcode_status AS ENUM (
  'found', 'ambiguous', 'not_found', 'not_board_game', 'invalid_barcode'
);

CREATE TYPE catalog.confidence_level AS ENUM ('high', 'medium', 'low');

CREATE TYPE catalog.rule_section AS ENUM (
  'setup', 'turn_step', 'special_rule',
  'end_trigger', 'scoring', 'tie_breaker'
);

CREATE TYPE catalog.barcode_source AS ENUM ('catalog', 'api', 'llm', 'user', 'manual');

CREATE TYPE catalog.review_status AS ENUM ('unreviewed', 'reviewed', 'flagged');

-- ============================================================
-- Game sheets (one generated "found" object = one row)
-- ============================================================

CREATE TABLE catalog.games (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- game
  name                 TEXT NOT NULL,
  localized_names      JSONB NOT NULL DEFAULT '{}',   -- {"fr": "...", "en": "..."}
  edition              TEXT,
  publisher            TEXT,
  year                 SMALLINT,
  bgg_id               INTEGER,

  -- identification
  confidence           catalog.confidence_level NOT NULL,

  -- players / age / duration
  players_min          SMALLINT NOT NULL,
  players_max          SMALLINT NOT NULL,
  players_recommended  SMALLINT[] NOT NULL DEFAULT '{}',
  min_age              SMALLINT,
  duration_min         SMALLINT,
  duration_max         SMALLINT,

  -- first-level multilingual texts
  languages            TEXT[] NOT NULL,                -- {"fr","en"}
  description          JSONB NOT NULL,
  turn_summary         JSONB,
  end_timing           JSONB,
  end_winner           JSONB,

  -- display (API contract)
  categories           TEXT[] NOT NULL DEFAULT '{}',   -- category keys, labels translated by the API
  image_url            TEXT,
  art_key              TEXT,

  -- tracking
  review_status        catalog.review_status NOT NULL DEFAULT 'unreviewed',
  generated_by         TEXT,                           -- e.g. "claude-opus-5-5"
  raw_json             JSONB,                          -- raw model output, for audit
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT games_players_check
    CHECK (players_min >= 1 AND players_max >= players_min),
  CONSTRAINT games_duration_check
    CHECK (duration_min IS NULL OR duration_max IS NULL OR duration_max >= duration_min)
);

-- ============================================================
-- Rule items: setup, turn steps, special rules,
-- end of game triggers / scoring / tie breakers
-- ============================================================

CREATE TABLE catalog.game_rule_items (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id        BIGINT NOT NULL REFERENCES catalog.games(id) ON DELETE CASCADE,
  section        catalog.rule_section NOT NULL,
  item_key       TEXT NOT NULL,          -- "setup-1", "turn-2", "rule-1"...
  sort_order     SMALLINT,               -- NULL for special_rule and end_trigger
  player_counts  SMALLINT[],             -- NULL = every configuration
  optional       BOOLEAN,                -- only used for turn_step
  title          JSONB,                  -- NULL for setup, end_trigger, tie_breaker
  text           JSONB NOT NULL,

  CONSTRAINT game_rule_items_key_unique UNIQUE (game_id, item_key)
);

-- ============================================================
-- Sources and warnings
-- ============================================================

CREATE TABLE catalog.game_sources (
  id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id   BIGINT NOT NULL REFERENCES catalog.games(id) ON DELETE CASCADE,
  title     TEXT NOT NULL,
  url       TEXT NOT NULL
);

CREATE TABLE catalog.game_warnings (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id     BIGINT NOT NULL REFERENCES catalog.games(id) ON DELETE CASCADE,
  sort_order  SMALLINT NOT NULL,
  text        JSONB NOT NULL
);

-- ============================================================
-- Barcodes (several codes may point to the same sheet)
-- ============================================================

CREATE TABLE catalog.barcodes (
  barcode        TEXT PRIMARY KEY,           -- normalized EAN-13
  status         catalog.barcode_status NOT NULL,
  game_id        BIGINT REFERENCES catalog.games(id) ON DELETE SET NULL,  -- only when 'found'
  edition_label  TEXT,                       -- e.g. "Édition anniversaire"
  source         catalog.barcode_source NOT NULL,
  checked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  retry_after    TIMESTAMPTZ,                -- when a negative answer may be retried

  CONSTRAINT barcodes_game_status_check
    CHECK ((status = 'found') = (game_id IS NOT NULL))
);

-- Candidates for the 'ambiguous' status
CREATE TABLE catalog.barcode_candidates (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barcode    TEXT NOT NULL REFERENCES catalog.barcodes(barcode) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  edition    TEXT,
  publisher  TEXT,
  year       SMALLINT,
  game_id    BIGINT REFERENCES catalog.games(id) ON DELETE SET NULL  -- when the candidate is in the catalog
);

-- ============================================================
-- Generation queue (daily budget)
-- ============================================================

CREATE TABLE catalog.generation_queue (
  barcode        TEXT PRIMARY KEY,
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count  INTEGER NOT NULL DEFAULT 1,   -- number of pending scans: used for priority
  attempts       SMALLINT NOT NULL DEFAULT 0,
  last_error     TEXT,
  locked_until   TIMESTAMPTZ                   -- worker lease; NULL or past = claimable
);

-- Every call to the generator, successful or not. Source of truth of the
-- daily budget, since failed calls cost tokens too.
CREATE TABLE catalog.generation_attempts (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barcode       TEXT NOT NULL,
  attempted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome       TEXT NOT NULL,                 -- a barcode_status, or 'error'
  model         TEXT
);

-- ============================================================
-- Indexes
-- ============================================================

-- games
CREATE INDEX games_name_idx           ON catalog.games (lower(name));
CREATE INDEX games_bgg_id_idx         ON catalog.games (bgg_id);
CREATE INDEX games_review_status_idx  ON catalog.games (review_status);
CREATE INDEX games_confidence_idx     ON catalog.games (confidence);

-- game_rule_items
CREATE INDEX game_rule_items_game_section_idx
  ON catalog.game_rule_items (game_id, section, sort_order);
CREATE INDEX game_rule_items_player_counts_idx
  ON catalog.game_rule_items USING GIN (player_counts);

-- game_sources / game_warnings
CREATE INDEX game_sources_game_idx   ON catalog.game_sources (game_id);
CREATE INDEX game_warnings_game_idx  ON catalog.game_warnings (game_id, sort_order);

-- barcodes
CREATE INDEX barcodes_game_idx    ON catalog.barcodes (game_id);
CREATE INDEX barcodes_status_idx  ON catalog.barcodes (status);
CREATE INDEX barcodes_retry_idx   ON catalog.barcodes (retry_after)
  WHERE status = 'not_found';

-- barcode_candidates
CREATE INDEX barcode_candidates_barcode_idx  ON catalog.barcode_candidates (barcode);
CREATE INDEX barcode_candidates_game_idx     ON catalog.barcode_candidates (game_id);

-- generation_queue
CREATE INDEX generation_queue_priority_idx
  ON catalog.generation_queue (request_count DESC, requested_at);

-- generation_attempts
CREATE INDEX generation_attempts_attempted_at_idx
  ON catalog.generation_attempts (attempted_at);

-- ============================================================
-- Automatic games.updated_at
-- ============================================================

-- +goose StatementBegin
CREATE FUNCTION catalog.set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

CREATE TRIGGER games_set_updated_at
  BEFORE UPDATE ON catalog.games
  FOR EACH ROW
  EXECUTE FUNCTION catalog.set_updated_at();

-- +goose Down
DROP SCHEMA catalog CASCADE;
