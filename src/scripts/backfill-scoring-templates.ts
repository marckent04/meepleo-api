/**
 * One-shot backfill of the score sheet template of the games whose sheet was
 * generated before templates were derived (`scoring_template` still null).
 *
 *   yarn games:backfill-scoring --dry-run --limit 5
 *   yarn games:backfill-scoring --concurrency 3
 *   yarn games:backfill-scoring --dry-run --bgg-id 432 --bgg-id 13
 *
 * For each game, Claude derives the template from the stored sheet, in the
 * language it was generated in (no web search: a short call). Outside dry
 * runs, it goes through GenerateGameScoringTemplateCommand, like after a
 * sheet generation: the template is validated, saved and traced as a
 * `scoring` run. A dry run only logs the template, and leaves no run.
 * Replayable: games that already have a template are skipped.
 */
import { parseArgs } from 'node:util'
import { NestFactory } from '@nestjs/core'
import { CommandBus } from '@nestjs/cqrs'
import { AppModule } from '@/app.module'
import { GenerateGameScoringTemplateCommand } from '@/domain/game'
import { assertValidScoringTemplate } from '@/domain/play'
import { GameScoringTemplateGenerator } from '@/infrastructure/adapters/anthropic'
import { GameRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import type { GameWithoutScoringTemplate } from '@/shared/types'

type Outcome = 'generated' | 'skipped' | 'failed'

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      concurrency: { type: 'string', default: '3' },
      limit: { type: 'string' },
      'bgg-id': { type: 'string', multiple: true },
      'dry-run': { type: 'boolean', default: false },
    },
  })
  const bggIds = (values['bgg-id'] ?? []).map((value) => {
    const id = Number(value)
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error(`Invalid BGG id: "${value}"`)
    }
    return id
  })
  const concurrency = Math.max(1, Number(values.concurrency) || 1)
  const limit = values.limit ? Math.max(1, Number(values.limit)) : undefined
  const dryRun = values['dry-run']

  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  })
  app.enableShutdownHooks()
  const commandBus = app.get(CommandBus)
  const gameRepository = app.get(GameRepository)
  const generator = app.get(GameScoringTemplateGenerator)
  const logger = await app.resolve(LoggerService)
  logger.setContext('BackfillScoringTemplates')

  /** Derives the template without saving it; false when the sheet is gone. */
  const preview = async (game: GameWithoutScoringTemplate) => {
    const sheet = await gameRepository.findSheet(game.id, game.language)
    if (!sheet) return false
    const { result } = await generator.generate(sheet)
    assertValidScoringTemplate(result)
    logger.info({ ...game, template: result }, 'Scoring template derived')
    return true
  }

  /** Derives and saves the template; false when the sheet is gone. */
  const backfill = async (game: GameWithoutScoringTemplate) => {
    await commandBus.execute(
      new GenerateGameScoringTemplateCommand({
        gameId: game.id,
        language: game.language,
      }),
    )
    const saved = await gameRepository.findScoringTemplate(
      game.id,
      game.language,
    )
    if (!saved) return false
    logger.info({ ...game, template: saved }, 'Scoring template saved')
    return true
  }

  try {
    const games = await gameRepository.listWithoutScoringTemplate({
      bggIds,
      limit,
    })
    logger.info(
      { games: games.length, dryRun, model: generator.model },
      'Backfilling scoring templates',
    )

    const counts: Record<Outcome, number> = {
      generated: 0,
      skipped: 0,
      failed: 0,
    }
    const queue = [...games]
    const worker = async () => {
      for (let game = queue.shift(); game; game = queue.shift()) {
        try {
          const done = dryRun ? await preview(game) : await backfill(game)
          if (done) {
            counts.generated++
          } else {
            counts.skipped++
            logger.warn(game, 'No sheet in the generation language: skipped')
          }
        } catch (error) {
          counts.failed++
          logger.error({ ...game, err: error }, 'Scoring template failed')
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker))
    logger.info({ ...counts, dryRun }, 'Scoring template backfill done')
    if (counts.failed > 0) process.exitCode = 1
  } finally {
    await app.close()
  }
}

main().catch((error: unknown) => {
  process.exitCode = 1
  throw error
})
