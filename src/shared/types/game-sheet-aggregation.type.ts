import type { GameAggregationOperation } from '../errors/game-aggregation-failed.error'
import type { GameSheet } from './game-sheet.type'

export type GameAggregationRunStatus = 'running' | 'success' | 'failure'

/** Dernier état connu d'une agrégation de fiche (`game_aggregation_runs`). */
export type GameAggregationRunSummary = {
  id: string
  status: GameAggregationRunStatus
  /** null pour un échec antérieur à l'appel à l'IA. */
  operation: GameAggregationOperation | null
  /** ErrorCode d'un échec, null sinon. */
  errorCode: string | null
  startedAt: Date
}

/** Agrégation lancée en tâche de fond, à exécuter puis clore (run RUNNING). */
export type GameSheetAggregationJob = {
  runId: string
  gameId: string
  language: string
  operation: GameAggregationOperation
  /** Langue source d'une traduction, null pour une génération. */
  sourceLanguage: string | null
}

/**
 * Fiche d'un jeu dans une langue : prête, ou en cours d'agrégation.
 * `job` n'est renseigné que si la demande vient de lancer l'agrégation.
 */
export type GameSheetAvailability =
  | { status: 'ready'; sheet: GameSheet }
  | { status: 'pending'; job: GameSheetAggregationJob | null }
