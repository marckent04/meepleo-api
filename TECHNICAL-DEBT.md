# Technical debt

Known shortcuts and workarounds to revisit. Add a row whenever a fix trades
correctness or simplicity for speed of delivery, and fill in its resolution date once resolved.

| # | Debt | Where | Added | Resolution date | Resolution plan |
|---|------|-------|-------|-------------|-----------------|
| 1 | Prisma transaction timeout raised to 30 s (`maxWait` 10 s) instead of fixing why saving a game sheet takes more than the default 5 s. The transaction chains many sequential queries (lock, read with rules, delete / create rules, game update, run update), so its duration grows with the number of rules and the database latency. | `AggregateGameSheetHandler.save()` in `src/domain/game/handlers/aggregate-game-sheet.handler.ts` | 2026-11-08 | - | Measure the real duration of `save()` and the database latency. Move `findWithRules` (and any read that does not need the lock) out of the transaction, or cut more statements. Then lower the timeout back toward the default. |

## Context

- **#1 symptom:** `Transaction API error: A query cannot be executed on an expired
  transaction. The timeout for this transaction was 5000 ms…` on
  `gameAggregationRun.update()`.
- **#1 already done:** `saveTranslation` now updates all rules in one SQL
  statement instead of one `UPDATE` per rule.
