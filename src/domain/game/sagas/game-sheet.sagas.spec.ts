import { lastValueFrom, of, toArray } from 'rxjs'
import type { GameSheetAggregationJob } from '@/shared/types'
import { AggregateGameSheetCommand } from '../commands'
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
})
