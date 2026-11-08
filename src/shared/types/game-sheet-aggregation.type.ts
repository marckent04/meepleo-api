import type { GameAggregationOperation } from '../errors/game-aggregation-failed.error'
import type { GameSheet } from './game-sheet.type'

export type GameAggregationRunStatus = 'running' | 'success' | 'failure'

/** Last known state of a sheet aggregation (`game_aggregation_runs`). */
export type GameAggregationRunSummary = {
  id: string
  status: GameAggregationRunStatus
  /** null for a failure before the AI call. */
  operation: GameAggregationOperation | null
  /** ErrorCode of a failure, null otherwise. */
  errorCode: string | null
  startedAt: Date
}

/** Aggregation started in the background, to execute then close (RUNNING run). */
export type GameSheetAggregationJob = {
  runId: string
  gameId: string
  language: string
  operation: GameAggregationOperation
  /** Source language of a translation, null for a generation. */
  sourceLanguage: string | null
}

/**
 * Sheet of a game in a language: ready, or being aggregated.
 * `job` is only set if the request has just started the aggregation.
 */
export type GameSheetAvailability =
  | { status: 'ready'; sheet: GameSheet }
  | { status: 'pending'; job: GameSheetAggregationJob | null }
