import { BusinessRuleError, ErrorCode } from '@/shared/errors'
import {
  type PlayScore,
  type PlaySideResult,
  type PlaySummary,
  ROUND_SCORE_KEY,
  SCORING_MAX_ABS_VALUE,
  SCORING_MAX_ROUNDS,
  SCORING_MAX_ROWS,
  SCORING_ROW_KEY_PATTERN,
  type ScoringRow,
  type ScoringSides,
  type ScoringTemplate,
  TOTAL_SCORE_KEY,
} from '@/shared/types'

/**
 * Score sheet rules, independent of storage: what a template, a player list
 * and a grid may contain, and how totals, ranks and winners are derived.
 * Every cell is worth `value × pointsEach` (1 for rounds and the single
 * total), a side's total is the sum of its cells.
 */

function invalid(code: ErrorCode, reason: string): BusinessRuleError {
  return new BusinessRuleError(code, reason, { details: { reason } })
}

/** Throws INVALID_SCORING_TEMPLATE when the template is inconsistent. */
export function assertValidScoringTemplate(template: ScoringTemplate): void {
  const fail = (reason: string) =>
    invalid(ErrorCode.INVALID_SCORING_TEMPLATE, reason)
  if (
    template.outcome === 'manual' &&
    (template.rows.length > 0 || template.rounds !== null)
  ) {
    throw fail('A manual outcome has no score sheet: no rows nor rounds')
  }
  const count = template.rounds?.count
  if (typeof count === 'number' && (count < 1 || count > SCORING_MAX_ROUNDS)) {
    throw fail(`The round count must be between 1 and ${SCORING_MAX_ROUNDS}`)
  }
  if (template.rows.length > SCORING_MAX_ROWS) {
    throw fail(`At most ${SCORING_MAX_ROWS} rows`)
  }
  const keys = new Set<string>()
  for (const row of template.rows) {
    if (!SCORING_ROW_KEY_PATTERN.test(row.key)) {
      throw fail(`Invalid row key "${row.key}"`)
    }
    if (keys.has(row.key)) throw fail(`Duplicate row key "${row.key}"`)
    keys.add(row.key)
    if (row.input === 'points' && row.pointsEach !== 1) {
      throw fail(`Row "${row.key}": a points row is worth 1 per point`)
    }
    if (row.pointsEach === 0) {
      throw fail(`Row "${row.key}": pointsEach cannot be 0`)
    }
    if (row.exclusive && row.input !== 'toggle') {
      throw fail(`Row "${row.key}": only a toggle can be exclusive`)
    }
  }
}

/**
 * Throws INVALID_PLAY_PLAYERS unless the sides of the players form the
 * columns `0..n-1` expected by `sides`: one player per column (individual),
 * at least two columns of team mates (teams), a single column (cooperative).
 */
export function assertValidPlayerSides(
  sides: ScoringSides,
  playerSides: number[],
): void {
  const fail = (reason: string) =>
    invalid(ErrorCode.INVALID_PLAY_PLAYERS, reason)
  if (playerSides.length === 0) throw fail('A play needs at least one player')
  const columns = new Set(playerSides)
  for (let side = 0; side < columns.size; side++) {
    if (!columns.has(side)) throw fail('Sides must be numbered 0 to n-1')
  }
  if (sides === 'individual' && columns.size !== playerSides.length) {
    throw fail('Each player has their own side')
  }
  if (sides === 'teams' && columns.size < 2) {
    throw fail('A team play needs at least two teams')
  }
  if (sides === 'cooperative' && columns.size !== 1) {
    throw fail('All players of a cooperative play share side 0')
  }
}

type CellRule = { pointsEach: number; row: ScoringRow | null }

/** Rule of the cell `rowKey` / `round`, or null when the template has no such cell. */
function cellRule(
  template: ScoringTemplate,
  rowKey: string,
  round: number,
): CellRule | null {
  if (template.outcome === 'manual') return null
  if (rowKey === ROUND_SCORE_KEY) {
    if (template.rounds === null || round < 1) return null
    const maxRound = template.rounds.count ?? SCORING_MAX_ROUNDS
    return round <= maxRound ? { pointsEach: 1, row: null } : null
  }
  if (round !== 0) return null
  if (rowKey === TOTAL_SCORE_KEY) {
    const single = template.rounds === null && template.rows.length === 0
    return single ? { pointsEach: 1, row: null } : null
  }
  const row = template.rows.find((candidate) => candidate.key === rowKey)
  return row ? { pointsEach: row.pointsEach, row } : null
}

/**
 * Throws INVALID_PLAY_SCORES when a cell does not exist in the template, is
 * entered twice, or holds a value its input does not accept (negative count,
 * toggle other than 0 / 1, exclusive toggle checked for several sides).
 */
export function assertValidScores(
  template: ScoringTemplate,
  sideCount: number,
  scores: PlayScore[],
): void {
  const fail = (reason: string) =>
    invalid(ErrorCode.INVALID_PLAY_SCORES, reason)
  const seen = new Set<string>()
  const exclusiveOwners = new Map<string, number>()
  for (const score of scores) {
    const cell = `${score.side}/${score.rowKey}/${score.round}`
    if (score.side < 0 || score.side >= sideCount) {
      throw fail(`Cell ${cell}: unknown side`)
    }
    const rule = cellRule(template, score.rowKey, score.round)
    if (!rule) throw fail(`Cell ${cell}: not in the score sheet`)
    if (seen.has(cell)) throw fail(`Cell ${cell}: entered twice`)
    seen.add(cell)
    if (Math.abs(score.value) > SCORING_MAX_ABS_VALUE) {
      throw fail(`Cell ${cell}: value out of bounds`)
    }
    const input = rule.row?.input ?? 'points'
    if (input === 'count' && score.value < 0) {
      throw fail(`Cell ${cell}: a count cannot be negative`)
    }
    if (input === 'toggle' && score.value !== 0 && score.value !== 1) {
      throw fail(`Cell ${cell}: a toggle is 0 or 1`)
    }
    if (rule.row?.exclusive && score.value === 1) {
      if (exclusiveOwners.has(score.rowKey)) {
        throw fail(`Row "${score.rowKey}" can only be checked for one side`)
      }
      exclusiveOwners.set(score.rowKey, score.side)
    }
  }
}

/**
 * Total and rank of each side `0..sideCount-1`. Ties share a rank (1, 2, 2, 4).
 * A manual outcome has neither totals nor ranks.
 */
export function computeSideResults(
  template: ScoringTemplate,
  sideCount: number,
  scores: PlayScore[],
): PlaySideResult[] {
  const sides = Array.from({ length: sideCount }, (_, side) => side)
  if (template.outcome === 'manual') {
    return sides.map((side) => ({ side, total: null, rank: null }))
  }
  const totals = sides.map(() => 0)
  for (const score of scores) {
    const rule = cellRule(template, score.rowKey, score.round)
    if (rule && score.side < sideCount) {
      totals[score.side] += score.value * rule.pointsEach
    }
  }
  const isBetter = (a: number, b: number) =>
    template.outcome === 'highest' ? a > b : a < b
  return sides.map((side) => ({
    side,
    total: totals[side],
    rank: 1 + totals.filter((other) => isBetter(other, totals[side])).length,
  }))
}

/** Sides ranked first; none for a manual outcome (the players choose). */
export function computeWinnerSides(results: PlaySideResult[]): number[] {
  return results.filter((result) => result.rank === 1).map(({ side }) => side)
}

/** Throws INVALID_PLAY_WINNERS when a side does not exist or is repeated. */
export function assertValidWinnerSides(
  sideCount: number,
  winnerSides: number[],
): void {
  const unique = new Set(winnerSides)
  if (
    unique.size !== winnerSides.length ||
    winnerSides.some((side) => side < 0 || side >= sideCount)
  ) {
    throw invalid(
      ErrorCode.INVALID_PLAY_WINNERS,
      'Winners must be distinct existing sides',
    )
  }
}

/** Number of columns of the play's score sheet (sides are `0..n-1`). */
export function sideCountOf(play: Pick<PlaySummary, 'players'>): number {
  return new Set(play.players.map(({ side }) => side)).size
}
