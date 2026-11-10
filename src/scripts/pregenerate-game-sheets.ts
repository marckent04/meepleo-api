/**
 * Pre-generates the sheets of chosen games, outside any HTTP request: users
 * then find them immediately (200) instead of waiting for the generation.
 *
 *   pnpm sheets:pregenerate --language fr 13 822 30549
 *   pnpm sheets:pregenerate --language fr --file bgg-ids.txt --concurrency 3
 *
 * Identifiers are BGG ids (one per line in --file). Costly:
 * each missing sheet triggers an AI generation (~1 min). Replayable:
 * sheets that are already ready or in progress are skipped.
 */
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { NestFactory } from '@nestjs/core'
import { CommandBus, EventBus, ofType } from '@nestjs/cqrs'
import { ClsService } from 'nestjs-cls'
import { filter, firstValueFrom, merge } from 'rxjs'
import { AppModule } from '@/app.module'
import {
  GameSheetAggregatedEvent,
  GameSheetAggregationFailedEvent,
  RequestGameSheetCommand,
} from '@/domain/game'
import { GameRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'

type Outcome = 'generated' | 'ready' | 'pending' | 'failed'

function parseBggIds(values: string[], file: string | undefined): number[] {
  const raw = [
    ...values,
    ...(file ? readFileSync(file, 'utf8').split(/\s+/) : []),
  ].filter(Boolean)
  return [
    ...new Set(
      raw.map((value) => {
        const id = Number(value)
        if (!Number.isInteger(id) || id <= 0) {
          throw new Error(`Invalid BGG id: "${value}"`)
        }
        return id
      }),
    ),
  ]
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      language: { type: 'string', default: 'fr' },
      file: { type: 'string' },
      concurrency: { type: 'string', default: '3' },
    },
  })
  const language = values.language
  const concurrency = Math.max(1, Number(values.concurrency) || 1)
  const bggIds = parseBggIds(positionals, values.file)
  if (bggIds.length === 0) {
    throw new Error('No BGG id: pass them as arguments or via --file')
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  })
  app.enableShutdownHooks()
  const commandBus = app.get(CommandBus)
  const eventBus = app.get(EventBus)
  const cls = app.get(ClsService)
  const logger = await app.resolve(LoggerService)
  logger.setContext('PregenerateGameSheets')

  try {
    const games = await app.get(GameRepository).findIdsByBggIds(bggIds)
    const unknown = bggIds.length - games.length
    logger.info(
      { requested: bggIds.length, found: games.length, unknown, language },
      'Pre-generating game sheets',
    )

    /** Outcome of the aggregation started by the saga for this game. */
    const finished = (gameId: string) =>
      firstValueFrom(
        merge(
          eventBus.pipe(ofType(GameSheetAggregatedEvent)),
          eventBus.pipe(ofType(GameSheetAggregationFailedEvent)),
        ).pipe(
          filter(
            (event) =>
              event.job.gameId === gameId && event.job.language === language,
          ),
        ),
      )

    const pregenerate = (gameId: string): Promise<Outcome> =>
      cls.run(async () => {
        // Subscribed before the request: the completion event cannot be missed.
        const outcome = finished(gameId)
        const availability = await commandBus.execute(
          new RequestGameSheetCommand({ gameId, language }),
        )
        if (availability.status === 'ready') return 'ready'
        if (!availability.job) return 'pending'
        const event = await outcome
        if (event instanceof GameSheetAggregationFailedEvent) throw event.error
        return 'generated'
      })

    const counts: Record<Outcome, number> = {
      generated: 0,
      ready: 0,
      pending: 0,
      failed: 0,
    }
    const queue = [...games]
    const worker = async () => {
      for (let game = queue.shift(); game; game = queue.shift()) {
        try {
          const outcome = await pregenerate(game.id)
          counts[outcome]++
          logger.info({ ...game, outcome }, 'Game sheet pre-generation')
        } catch (error) {
          counts.failed++
          logger.error(
            { ...game, err: error },
            'Game sheet pre-generation failed',
          )
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker))
    logger.info({ ...counts, unknown }, 'Game sheet pre-generation done')
    if (counts.failed > 0) process.exitCode = 1
  } finally {
    await app.close()
  }
}

main().catch((error: unknown) => {
  process.exitCode = 1
  throw error
})
