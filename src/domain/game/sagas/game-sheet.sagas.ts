import { Injectable } from '@nestjs/common'
import { type ICommand, type IEvent, ofType, Saga } from '@nestjs/cqrs'
import { map, type Observable } from 'rxjs'
import { AggregateGameSheetCommand } from '../commands'
import { GameSheetAggregationStartedEvent } from '../events'

@Injectable()
export class GameSheetSagas {
  /**
   * Exécute en tâche de fond l'agrégation réservée par RequestGameSheetCommand.
   * Un échec de la commande est déjà tracé dans le run ; le bus le publie
   * ensuite sur l'UnhandledExceptionBus et le logue.
   */
  @Saga()
  aggregationStarted = (events$: Observable<IEvent>): Observable<ICommand> =>
    events$.pipe(
      ofType(GameSheetAggregationStartedEvent),
      map((event) => new AggregateGameSheetCommand(event.job)),
    )
}
