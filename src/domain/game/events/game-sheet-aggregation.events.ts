import type { GameAggregationFailedError } from '@/shared/errors'
import type { GameSheetAggregationJob } from '@/shared/types'

/** Une agrégation de fiche a été réservée (run RUNNING commité) : elle reste à exécuter. */
export class GameSheetAggregationStartedEvent {
  constructor(readonly job: GameSheetAggregationJob) {}
}

/** La fiche a été enregistrée dans la langue du job et le run clos en SUCCESS. */
export class GameSheetAggregatedEvent {
  constructor(readonly job: GameSheetAggregationJob) {}
}

/** L'agrégation a échoué ; le run a été clos en FAILURE (sauf si l'écriture a elle-même échoué). */
export class GameSheetAggregationFailedEvent {
  constructor(
    readonly job: GameSheetAggregationJob,
    readonly error: GameAggregationFailedError,
  ) {}
}
