-- name: InsertUser :one
INSERT INTO identity.users (kind)
VALUES ($1)
RETURNING id, kind, created_at;

-- name: InsertRefreshToken :one
-- A NULL family starts a new family (a new login); rotations pass the family
-- of the token they replace.
INSERT INTO identity.refresh_tokens (user_id, family_id, token_hash, issued_at, expires_at)
VALUES (sqlc.arg(user_id), COALESCE(sqlc.narg(family_id)::uuid, uuidv7()), sqlc.arg(token_hash), sqlc.arg(issued_at), sqlc.arg(expires_at))
RETURNING id, family_id;

-- name: GetRefreshTokenByHash :one
SELECT id, user_id, family_id, issued_at, expires_at, revoked_at
FROM identity.refresh_tokens
WHERE token_hash = $1;

-- name: RevokeRefreshToken :execrows
-- Only revokes a token that is still active, so two concurrent refreshes with
-- the same token cannot both succeed.
UPDATE identity.refresh_tokens
SET revoked_at = sqlc.arg(revoked_at)
WHERE id = sqlc.arg(id) AND revoked_at IS NULL;

-- name: RevokeFamily :exec
UPDATE identity.refresh_tokens
SET revoked_at = sqlc.arg(revoked_at)
WHERE family_id = sqlc.arg(family_id) AND revoked_at IS NULL;

-- name: RevokeUserTokens :exec
UPDATE identity.refresh_tokens
SET revoked_at = sqlc.arg(revoked_at)
WHERE user_id = sqlc.arg(user_id) AND revoked_at IS NULL;
