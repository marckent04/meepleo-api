import { Injectable } from '@nestjs/common'
import { type ICommand, type IEvent, ofType, Saga } from '@nestjs/cqrs'
import { map, type Observable } from 'rxjs'
import { AggregateGameSheetCommand } from '../commands'
import { GameSheetAggregationStartedEvent } from '../events'

@Injectable()
export class GameSheetSagas {
  /**
   * Runs in the background the aggregation reserved by RequestGameSheetCommand.
   * A command failure is already traced in the run; the bus then publishes
   * it on the UnhandledExceptionBus and logs it.
   */
  @Saga()
  aggregationStarted = (events$: Observable<IEvent>): Observable<ICommand> =>
    events$.pipe(
      ofType(GameSheetAggregationStartedEvent),
      map((event) => new AggregateGameSheetCommand(event.job)),
    )
}
