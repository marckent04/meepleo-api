# Sheet generation eval: metrics

Judge: Claude Sonnet 5.5 (effort high, structured output), reading the frozen official
rulebook (`rulebooks/<id>.pdf`) and the frozen key-rules checklist (`checklists/<id>.json`).
Variants are excluded from coverage. Metrics are computed in `judge.mjs` from per-item verdicts.

- **usable** (headline, strict): right game AND 0 major errors AND no critical checklist rule
  missing. Box contents are not critical unless setup sorts/removes components by count.
- **correct_game**: the sheet describes the same game/edition as the rulebook.
- **coverage**: (correct + 0.5 x partial) / non-variant checklist rules. Partial = stated
  incompletely without contradiction; never a major error.
- **supported**: 1 - unsupported statements / sheet rule entries (catches invented rules).
- **major_errors** (lower is better): critical checklist rules contradicted (an omission is
  never wrong) + major
  unsupported statements (would change how the game is played or scored).

Cases run in cold start (stored ruleBookUrl cleared). Generation failures go to
`errors.jsonl`, never scored as 0. Web search fees ($10 / 1000 searches) are not in
`cost_usd`; see the Searches column.

## Baseline notes (2026-11-14)

- g01 excluded: the reference copy was a different game with the same name (rows kept in
  baseline/excluded.jsonl). g32 excluded: no reachable rulebook.
- g31 UNO: the reference is the 2001 30th-anniversary sheet (UNO penalty 4 cards); current
  Mattel rules say 2, so some UNO "major errors" are reference artefacts.
- g05 rep1 correct_game=0 is a judge error: it rejected "Bellevue", the official French title.
