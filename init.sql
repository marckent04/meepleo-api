-- ============================================================
-- schema.sql
-- Base de données : fiches de jeux de société par code-barres
-- SGBD : PostgreSQL
-- ============================================================

BEGIN;

-- ============================================================
-- Types
-- ============================================================

CREATE TYPE barcode_status AS ENUM (
  'found', 'ambiguous', 'not_found', 'not_board_game', 'invalid_barcode'
);

CREATE TYPE confidence_level AS ENUM ('high', 'medium', 'low');

CREATE TYPE rule_section AS ENUM (
  'setup', 'turn_step', 'special_rule',
  'end_trigger', 'scoring', 'tie_breaker'
);

CREATE TYPE barcode_source AS ENUM ('catalog', 'api', 'llm', 'user', 'manual');

CREATE TYPE review_status AS ENUM ('unreviewed', 'reviewed', 'flagged');

-- ============================================================
-- Fiches de jeu (un objet JSON "found" = une ligne)
-- ============================================================

CREATE TABLE games (
  id                   BIGSERIAL PRIMARY KEY,

  -- game
  name                 TEXT NOT NULL,
  localized_names      JSONB NOT NULL DEFAULT '{}',   -- {"fr": "...", "en": "..."}
  edition              TEXT,
  publisher            TEXT,
  year                 SMALLINT,
  bgg_id               INTEGER,

  -- identification
  confidence           confidence_level NOT NULL,

  -- joueurs / âge / durée
  players_min          SMALLINT NOT NULL,
  players_max          SMALLINT NOT NULL,
  players_recommended  SMALLINT[] NOT NULL DEFAULT '{}',
  min_age              SMALLINT,
  duration_min         SMALLINT,
  duration_max         SMALLINT,

  -- textes multilingues de premier niveau
  languages            TEXT[] NOT NULL,                -- {"fr","en"}
  description          JSONB NOT NULL,
  turn_summary         JSONB,
  end_timing           JSONB,
  end_winner           JSONB,

  -- suivi
  review_status        review_status NOT NULL DEFAULT 'unreviewed',
  generated_by         TEXT,                           -- ex. "claude-sonnet-5-5"
  raw_json             JSONB,                          -- sortie brute du modèle, pour audit
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT games_players_check
    CHECK (players_min >= 1 AND players_max >= players_min),
  CONSTRAINT games_duration_check
    CHECK (duration_min IS NULL OR duration_max IS NULL OR duration_max >= duration_min)
);

-- ============================================================
-- Éléments de règles : setup, turn.steps, special_rules,
-- end_of_game.triggers / scoring / tie_breakers
-- ============================================================

CREATE TABLE game_rule_items (
  id             BIGSERIAL PRIMARY KEY,
  game_id        BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  section        rule_section NOT NULL,
  item_key       TEXT NOT NULL,          -- "setup-1", "turn-2", "rule-1"...
  sort_order     SMALLINT,               -- NULL pour special_rule et end_trigger
  player_counts  SMALLINT[],             -- NULL = toutes les configurations
  optional       BOOLEAN,                -- utilisé seulement pour turn_step
  title          JSONB,                  -- NULL pour setup, end_trigger, tie_breaker
  text           JSONB NOT NULL,

  CONSTRAINT game_rule_items_key_unique UNIQUE (game_id, item_key)
);

-- ============================================================
-- Sources et avertissements
-- ============================================================

CREATE TABLE game_sources (
  id        BIGSERIAL PRIMARY KEY,
  game_id   BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  title     TEXT NOT NULL,
  url       TEXT NOT NULL
);

CREATE TABLE game_warnings (
  id          BIGSERIAL PRIMARY KEY,
  game_id     BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  sort_order  SMALLINT NOT NULL,
  text        JSONB NOT NULL
);

-- ============================================================
-- Codes-barres (plusieurs codes peuvent pointer vers une même fiche)
-- ============================================================

CREATE TABLE barcodes (
  barcode        TEXT PRIMARY KEY,
  status         barcode_status NOT NULL,
  game_id        BIGINT REFERENCES games(id) ON DELETE SET NULL,  -- seulement si 'found'
  edition_label  TEXT,                     -- ex. "Édition anniversaire"
  source         barcode_source NOT NULL,
  checked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  retry_after    TIMESTAMPTZ,              -- pour relancer un 'not_found' plus tard

  CONSTRAINT barcodes_game_status_check
    CHECK ((status = 'found') = (game_id IS NOT NULL))
);

-- Candidats pour le statut 'ambiguous'
CREATE TABLE barcode_candidates (
  id         BIGSERIAL PRIMARY KEY,
  barcode    TEXT NOT NULL REFERENCES barcodes(barcode) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  edition    TEXT,
  publisher  TEXT,
  year       SMALLINT,
  game_id    BIGINT REFERENCES games(id) ON DELETE SET NULL  -- si le candidat existe déjà au catalogue
);

-- ============================================================
-- Contributions des utilisateurs (code inconnu → "Quel est ce jeu ?")
-- ============================================================

CREATE TABLE barcode_submissions (
  id          BIGSERIAL PRIMARY KEY,
  barcode     TEXT NOT NULL,
  game_id     BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  device_id   TEXT NOT NULL,               -- identifiant anonyme de l'appareil
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT barcode_submissions_vote_unique UNIQUE (barcode, device_id)  -- un vote par appareil et par code
);

-- ============================================================
-- Signalements d'erreurs sur une fiche
-- ============================================================

CREATE TABLE game_reports (
  id            BIGSERIAL PRIMARY KEY,
  game_id       BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  rule_item_id  BIGINT REFERENCES game_rule_items(id) ON DELETE SET NULL,
  device_id     TEXT NOT NULL,
  message       TEXT NOT NULL,
  resolved      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- File d'attente de génération (budget quotidien)
-- ============================================================

CREATE TABLE generation_queue (
  barcode        TEXT PRIMARY KEY,
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count  INTEGER NOT NULL DEFAULT 1,   -- nombre de scans en attente : sert à prioriser
  attempts       SMALLINT NOT NULL DEFAULT 0,
  last_error     TEXT
);

-- ============================================================
-- Index
-- ============================================================

-- games
CREATE INDEX games_name_idx           ON games (lower(name));
CREATE INDEX games_bgg_id_idx         ON games (bgg_id);
CREATE INDEX games_review_status_idx  ON games (review_status);
CREATE INDEX games_confidence_idx     ON games (confidence);

-- game_rule_items
CREATE INDEX game_rule_items_game_section_idx
  ON game_rule_items (game_id, section, sort_order);
CREATE INDEX game_rule_items_player_counts_idx
  ON game_rule_items USING GIN (player_counts);

-- game_sources / game_warnings
CREATE INDEX game_sources_game_idx   ON game_sources (game_id);
CREATE INDEX game_warnings_game_idx  ON game_warnings (game_id, sort_order);

-- barcodes
CREATE INDEX barcodes_game_idx    ON barcodes (game_id);
CREATE INDEX barcodes_status_idx  ON barcodes (status);
CREATE INDEX barcodes_retry_idx   ON barcodes (retry_after)
  WHERE status = 'not_found';

-- barcode_candidates
CREATE INDEX barcode_candidates_barcode_idx  ON barcode_candidates (barcode);
CREATE INDEX barcode_candidates_game_idx     ON barcode_candidates (game_id);

-- barcode_submissions
CREATE INDEX barcode_submissions_barcode_game_idx
  ON barcode_submissions (barcode, game_id);
CREATE INDEX barcode_submissions_game_idx
  ON barcode_submissions (game_id);

-- game_reports
CREATE INDEX game_reports_game_idx       ON game_reports (game_id);
CREATE INDEX game_reports_rule_item_idx  ON game_reports (rule_item_id);
CREATE INDEX game_reports_unresolved_idx ON game_reports (created_at)
  WHERE resolved = false;

-- generation_queue
CREATE INDEX generation_queue_priority_idx
  ON generation_queue (request_count DESC, requested_at);

-- ============================================================
-- Mise à jour automatique de games.updated_at
-- ============================================================

CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER games_set_updated_at
  BEFORE UPDATE ON games
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

COMMIT;