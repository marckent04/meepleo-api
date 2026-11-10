/**
 * Score sheet of a game: columns are the sides, lines are what gets added up.
 * `rounds` adds one line per round, `rows` adds fixed scoring categories;
 * both can be combined (rounds then end-of-game bonuses).
 */

/** Who occupies a column of the score sheet. */
export const SCORING_SIDES = ['individual', 'teams', 'cooperative'] as const
export type ScoringSides = (typeof SCORING_SIDES)[number]

/**
 * How the winner is designated: highest total, lowest total, or chosen by the
 * players (no points: chess, Monopoly Deal, cooperative games).
 */
export const SCORING_OUTCOMES = ['highest', 'lowest', 'manual'] as const
export type ScoringOutcome = (typeof SCORING_OUTCOMES)[number]

/**
 * Input widget of a scoring row: `points` (numeric keypad, negatives allowed),
 * `count` (- / + counter, multiplied by `pointsEach`), `toggle` (checkbox
 * worth `pointsEach`).
 */
export const SCORING_ROW_INPUTS = ['points', 'count', 'toggle'] as const
export type ScoringRowInput = (typeof SCORING_ROW_INPUTS)[number]

/** Row keys: camelCase identifier, unique in a template. */
export const SCORING_ROW_KEY_PATTERN = /^[a-z][a-zA-Z0-9]{0,39}$/
export const SCORING_MAX_ROWS = 30
export const SCORING_MAX_ROUNDS = 100
export const SCORING_LABEL_MAX_LENGTH = 60
export const SCORING_HINT_MAX_LENGTH = 200
export const SCORING_TIE_BREAKER_MAX_LENGTH = 300
/** Bound of any entered value and of `pointsEach`. */
export const SCORING_MAX_ABS_VALUE = 100_000

export type ScoringRow = {
  /** Stable identifier, unique in the template (camelCase). */
  key: string
  label: string
  /** Scoring reminder, e.g. "1 point per set of 3 coins". */
  hint: string | null
  input: ScoringRowInput
  /** Points per unit (`count`) or when checked (`toggle`); 1 for `points`. May be negative. */
  pointsEach: number
  /** `toggle` only: a single side can have it (e.g. longest road). */
  exclusive: boolean
}

/** Score sheet template, with its texts in a single language. */
export type ScoringTemplate = {
  sides: ScoringSides
  outcome: ScoringOutcome
  /** null: no rounds; `count` null: as many rounds as the players want. */
  rounds: { count: number | null } | null
  /** Informative end score (e.g. 66 at 6 nimmt!): never blocks anything. */
  targetScore: number | null
  rows: ScoringRow[]
  /** Tie-breaker rule displayed on a tie, null when the rules define none. */
  tieBreaker: string | null
}

/** Template of a game without one: a single score per player, highest wins. */
export const DEFAULT_SCORING_TEMPLATE: ScoringTemplate = {
  sides: 'individual',
  outcome: 'highest',
  rounds: null,
  targetScore: null,
  rows: [],
  tieBreaker: null,
}

/**
 * Reserved row keys of the score cells (never match `SCORING_ROW_KEY_PATTERN`):
 * a round line (`round` >= 1), and the single score of a template without
 * rounds nor rows.
 */
export const ROUND_SCORE_KEY = '_round'
export const TOTAL_SCORE_KEY = '_total'
