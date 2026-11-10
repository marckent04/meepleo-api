import { Injectable } from '@nestjs/common'
import { type ICommand, type IEvent, ofType, Saga } from '@nestjs/cqrs'
import { filter, map, type Observable } from 'rxjs'
import { GameAddedToCatalogEvent } from '../../catalog/events'
import { GameAddedToWishlistEvent } from '../../wishlist/events'
import {
  AggregateGameSheetCommand,
  GenerateGameScoringTemplateCommand,
  RequestGameSheetCommand,
} from '../commands'
import {
  GameSheetAggregatedEvent,
  GameSheetAggregationStartedEvent,
} from '../events'

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

  /**
   * Prepares the sheet of a game added to the catalog or the wishlist, in the
   * user's language, so it is ready when the user plays it. A no-op if the
   * sheet exists or is being aggregated; a recent failure is only logged.
   */
  @Saga()
  gameAddedToUserList = (events$: Observable<IEvent>): Observable<ICommand> =>
    events$.pipe(
      ofType(GameAddedToCatalogEvent, GameAddedToWishlistEvent),
      map(
        ({ gameId, language }) =>
          new RequestGameSheetCommand({ gameId, language }),
      ),
    )

  /**
   * Derives the score sheet template from a newly generated sheet, in its
   * language. Translations reuse it: a text missing in a language falls
   * back to the generation language.
   */
  @Saga()
  sheetGenerated = (events$: Observable<IEvent>): Observable<ICommand> =>
    events$.pipe(
      ofType(GameSheetAggregatedEvent),
      filter(({ job }) => job.operation === 'generation'),
      map(
        ({ job }) =>
          new GenerateGameScoringTemplateCommand({
            gameId: job.gameId,
            language: job.language,
          }),
      ),
    )
}
