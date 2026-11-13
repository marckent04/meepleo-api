# Technical debt

Known shortcuts and workarounds to revisit. Add a row whenever a fix trades
correctness or simplicity for speed of delivery, and fill in its resolution date once resolved.

| # | Debt | Where | Added | Resolution date | Resolution plan |
|---|------|-------|-------|-------------|-----------------|
| 1 | Prisma transaction timeout raised to 30 s (`maxWait` 10 s) instead of fixing why saving a game sheet takes more than the default 5 s. The transaction chains many sequential queries (lock, read with rules, delete / create rules, game update, run update), so its duration grows with the number of rules and the database latency. | `AggregateGameSheetHandler.save()` in `src/domain/game/handlers/aggregate-game-sheet.handler.ts` | 2026-11-08 | - | Measure the real duration of `save()` and the database latency. Move `findWithRules` (and any read that does not need the lock) out of the transaction, or cut more statements. Then lower the timeout back toward the default. |
| 2 | Tombstones (`deletedAt`) of players, groups, plays, library, wishlist and favorites are never purged; the spec asks to keep them about 90 days so every device sees them. | Tables `players`, `groups`, `plays`, `user_games`, `user_favorites` | 2026-11-12 | - | Add a scheduled job deleting rows with `deleted_at` older than 90 days (and make `sync/pull` answer a full resync for a cursor older than that). |
| 3 | The `sync/pull` cursor is a revision drawn from `sync_revision_seq` when a row is written, not when its transaction commits: a long transaction can commit a lower revision after a higher one was already pulled, and that change would be missed. Single-statement writes make this unlikely today. | `set_sync_revision` trigger (migration `add_offline_sync`), `PullSyncHandler` | 2026-11-12 | - | Pull with a small overlap (re-read the last N revisions, idempotent on the client), or assign revisions at commit time. |

## Context

- **#1 symptom:** `Transaction API error: A query cannot be executed on an expired
  transaction. The timeout for this transaction was 5000 ms…` on
  `gameAggregationRun.update()`.
- **#1 already done:** `saveTranslation` now updates all rules in one SQL
  statement instead of one `UPDATE` per rule.
