import { lastValueFrom, of, toArray } from 'rxjs'
import type { GameSheetAggregationJob } from '@/shared/types'
import { GameAddedToCatalogEvent } from '../../catalog/events'
import { GameAddedToWishlistEvent } from '../../wishlist/events'
import { AggregateGameSheetCommand, RequestGameSheetCommand } from '../commands'
import {
  GameSheetAggregatedEvent,
  GameSheetAggregationStartedEvent,
} from '../events'
import { GameSheetSagas } from './game-sheet.sagas'

const job: GameSheetAggregationJob = {
  runId: '0195d1a2-0000-7000-8000-0000000000aa',
  gameId: '0195d1a2-0000-7000-8000-000000000001',
  language: 'en',
  operation: 'translation',
  sourceLanguage: 'fr',
}

describe('GameSheetSagas', () => {
  it('runs the aggregation of a started job and ignores other events', async () => {
    const sagas = new GameSheetSagas()

    const commands = await lastValueFrom(
      sagas
        .aggregationStarted(
          of(
            new GameSheetAggregatedEvent(job),
            new GameSheetAggregationStartedEvent(job),
          ),
        )
        .pipe(toArray()),
    )

    expect(commands).toEqual([new AggregateGameSheetCommand(job)])
  })

  it('requests the sheet of a game added to the catalog or the wishlist', async () => {
    const sagas = new GameSheetSagas()
    const userId = '0195d1a2-0000-7000-8000-000000000002'

    const commands = await lastValueFrom(
      sagas
        .gameAddedToUserList(
          of(
            new GameSheetAggregationStartedEvent(job),
            new GameAddedToCatalogEvent(userId, job.gameId, 'fr'),
            new GameAddedToWishlistEvent(userId, job.gameId, 'en'),
          ),
        )
        .pipe(toArray()),
    )

    expect(commands).toEqual([
      new RequestGameSheetCommand({ gameId: job.gameId, language: 'fr' }),
      new RequestGameSheetCommand({ gameId: job.gameId, language: 'en' }),
    ])
  })
})
