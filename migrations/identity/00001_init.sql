-- Identity schema: users and refresh tokens.
-- User ids are UUIDv7 (Postgres 18): time-ordered for index locality, and not
-- enumerable, unlike sequential ids, because they appear in tokens.

-- +goose Up
CREATE SCHEMA IF NOT EXISTS identity;

CREATE TYPE identity.user_kind AS ENUM ('guest', 'registered');

CREATE TABLE identity.users (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  kind        identity.user_kind NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Refresh tokens are opaque random values; only their SHA-256 hash is stored.
-- A family groups the successive rotations of one login, so that reuse of a
-- rotated token (a sign of theft) can revoke the whole family.
CREATE TABLE identity.refresh_tokens (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id      UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  family_id    UUID NOT NULL,
  token_hash   BYTEA NOT NULL UNIQUE,
  issued_at    TIMESTAMPTZ NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX refresh_tokens_user_idx    ON identity.refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx  ON identity.refresh_tokens (family_id);

-- +goose Down
DROP SCHEMA identity CASCADE;
