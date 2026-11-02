-- name: GetGame :one
SELECT id, name, localized_names, edition, publisher, year, bgg_id, confidence,
       players_min, players_max, players_recommended, min_age, duration_min, duration_max,
       languages, description, turn_summary, end_timing, end_winner,
       categories, image_url, art_key, review_status, generated_by
FROM catalog.games
WHERE id = $1;

-- name: ListRuleItems :many
SELECT section, item_key, sort_order, player_counts, optional, title, text
FROM catalog.game_rule_items
WHERE game_id = $1
ORDER BY section, sort_order NULLS LAST, id;

-- name: ListSources :many
SELECT title, url
FROM catalog.game_sources
WHERE game_id = $1
ORDER BY id;

-- name: ListWarnings :many
SELECT text
FROM catalog.game_warnings
WHERE game_id = $1
ORDER BY sort_order;

-- name: GetBarcode :one
SELECT barcode, status, game_id, edition_label, source, checked_at, retry_after
FROM catalog.barcodes
WHERE barcode = $1;

-- name: ListBarcodeCandidates :many
SELECT name, edition, publisher, year, game_id
FROM catalog.barcode_candidates
WHERE barcode = $1
ORDER BY id;

-- name: InsertGame :one
INSERT INTO catalog.games (
  name, localized_names, edition, publisher, year, bgg_id, confidence,
  players_min, players_max, players_recommended, min_age, duration_min, duration_max,
  languages, description, turn_summary, end_timing, end_winner,
  categories, image_url, art_key, review_status, generated_by, raw_json
) VALUES (
  $1, $2, $3, $4, $5, $6, $7,
  $8, $9, $10, $11, $12, $13,
  $14, $15, $16, $17, $18,
  $19, $20, $21, $22, $23, $24
)
RETURNING id;

-- name: InsertRuleItem :exec
INSERT INTO catalog.game_rule_items (game_id, section, item_key, sort_order, player_counts, optional, title, text)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8);

-- name: InsertSource :exec
INSERT INTO catalog.game_sources (game_id, title, url)
VALUES ($1, $2, $3);

-- name: InsertWarning :exec
INSERT INTO catalog.game_warnings (game_id, sort_order, text)
VALUES ($1, $2, $3);

-- name: UpsertBarcode :exec
INSERT INTO catalog.barcodes (barcode, status, game_id, edition_label, source, checked_at, retry_after)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (barcode) DO UPDATE SET
  status        = EXCLUDED.status,
  game_id       = EXCLUDED.game_id,
  edition_label = EXCLUDED.edition_label,
  source        = EXCLUDED.source,
  checked_at    = EXCLUDED.checked_at,
  retry_after   = EXCLUDED.retry_after;

-- name: DeleteBarcodeCandidates :exec
DELETE FROM catalog.barcode_candidates
WHERE barcode = $1;

-- name: InsertBarcodeCandidate :exec
INSERT INTO catalog.barcode_candidates (barcode, name, edition, publisher, year, game_id)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: EnqueueBarcode :exec
INSERT INTO catalog.generation_queue (barcode)
VALUES ($1)
ON CONFLICT (barcode) DO UPDATE SET
  request_count = catalog.generation_queue.request_count + 1;

-- name: ClaimBarcode :one
-- Takes the highest-priority claimable barcode and leases it. SKIP LOCKED
-- lets several workers claim concurrently without waiting on each other; the
-- lease (locked_until) keeps the row hidden after this short transaction
-- commits, while the slow model call runs outside any transaction.
UPDATE catalog.generation_queue AS q
SET locked_until = sqlc.arg(locked_until)
WHERE q.barcode = (
  SELECT c.barcode
  FROM catalog.generation_queue AS c
  WHERE c.locked_until IS NULL OR c.locked_until <= sqlc.arg(now)
  ORDER BY c.request_count DESC, c.requested_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
RETURNING q.barcode, q.request_count, q.attempts;

-- name: DequeueBarcode :exec
DELETE FROM catalog.generation_queue
WHERE barcode = $1;

-- name: RescheduleBarcode :exec
UPDATE catalog.generation_queue
SET attempts = attempts + 1,
    last_error = sqlc.arg(last_error),
    locked_until = sqlc.arg(locked_until)
WHERE barcode = sqlc.arg(barcode);

-- name: InsertAttempt :exec
INSERT INTO catalog.generation_attempts (barcode, attempted_at, outcome, model)
VALUES ($1, $2, $3, $4);

-- name: CountAttemptsSince :one
SELECT count(*)::int
FROM catalog.generation_attempts
WHERE attempted_at >= $1;
