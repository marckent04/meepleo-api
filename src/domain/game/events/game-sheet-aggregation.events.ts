import type { GameAggregationFailedError } from '@/shared/errors'
import type { GameSheetAggregationJob } from '@/shared/types'

/** A sheet aggregation was reserved (RUNNING run committed): it remains to be executed. */
export class GameSheetAggregationStartedEvent {
  constructor(readonly job: GameSheetAggregationJob) {}
}

/** The sheet was saved in the job language and the run closed as SUCCESS. */
export class GameSheetAggregatedEvent {
  constructor(readonly job: GameSheetAggregationJob) {}
}

/** The aggregation failed; the run was closed as FAILURE (unless the write itself failed). */
export class GameSheetAggregationFailedEvent {
  constructor(
    readonly job: GameSheetAggregationJob,
    readonly error: GameAggregationFailedError,
  ) {}
}
