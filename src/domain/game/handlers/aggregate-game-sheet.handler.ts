import { CommandBus, CommandHandler, EventBus } from '@nestjs/cqrs'
import { Transactional } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import {
  GameSheetGenerator,
  GameSheetTranslator,
} from '@/infrastructure/adapters/anthropic'
import {
  GameAggregationRunRepository,
  GameRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { GameAggregationFailedError } from '@/shared/errors'
import type {
  AiTrace,
  GameSheetTranslation,
  GeneratedGameSheet,
  Traced,
} from '@/shared/types'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import {
  GenerateGameSheetCommand,
  TranslateGameSheetCommand,
} from '../../game-sheet/commands'
import { AggregateGameSheetCommand } from '../commands'
import {
  GameSheetAggregatedEvent,
  GameSheetAggregationFailedEvent,
} from '../events'

// Prisma's default interactive transaction timeout (5 s) is too short for
// saving a sheet. See TECHNICAL-DEBT.md.
const SAVE_TRANSACTION_TIMEOUT_MS = 30_000
const SAVE_TRANSACTION_MAX_WAIT_MS = 10_000

type AggregationResult =
  | { operation: 'generation'; result: GeneratedGameSheet; trace: AiTrace }
  | { operation: 'translation'; result: GameSheetTranslation; trace: AiTrace }

@CommandHandler(AggregateGameSheetCommand)
export class AggregateGameSheetHandler extends AppCommandHandler<
  AggregateGameSheetCommand,
  void
> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly eventBus: EventBus,
    private readonly gameRepository: GameRepository,
    private readonly gameAggregationRunRepository: GameAggregationRunRepository,
    private readonly gameSheetGenerator: GameSheetGenerator,
    private readonly gameSheetTranslator: GameSheetTranslator,
    logger: LoggerService,
  ) {
    super(logger, 'system', AggregateGameSheetCommand.name)
    this.logger.setContext(AggregateGameSheetHandler.name)
  }

  /**
   * AI calls happen outside a transaction; only saving the sheet and the
   * SUCCESS run is transactional. On failure, the run is closed as FAILURE
   * then the error is rethrown. The outcome is published after the
   * commit.
   */
  async handle(command: AggregateGameSheetCommand): Promise<void> {
    const { runId, gameId, language, operation, sourceLanguage } = command
    const job = { runId, gameId, language, operation, sourceLanguage }
    const model =
      operation === 'generation'
        ? this.gameSheetGenerator.model
        : this.gameSheetTranslator.model
    this.logger.info(
      { gameId, language, operation, sourceLanguage, model, runId },
      'Aggregating game sheet',
    )
    const start = performance.now()
    try {
      const aggregated = await this.aggregate(command)
      await this.save(
        runId,
        gameId,
        aggregated,
        () => performance.now() - start,
      )
    } catch (cause) {
      const error = new GameAggregationFailedError({
        operation,
        model,
        sourceLanguage,
        durationMs: performance.now() - start,
        cause,
      })
      await this.recordFailure(runId, error)
      this.eventBus.publish(new GameSheetAggregationFailedEvent(job, error))
      throw error
    }
    this.eventBus.publish(new GameSheetAggregatedEvent(job))
  }

  private async aggregate({
    gameId,
    language,
    operation,
    sourceLanguage,
  }: AggregateGameSheetCommand): Promise<AggregationResult> {
    if (operation === 'generation') {
      const traced: Traced<GeneratedGameSheet> = await this.commandBus.execute(
        new GenerateGameSheetCommand({ gameId, language }),
      )
      return { operation, ...traced }
    }
    if (!sourceLanguage) {
      throw new Error('A translation requires a source language')
    }
    const traced: Traced<GameSheetTranslation> = await this.commandBus.execute(
      new TranslateGameSheetCommand({
        gameId,
        sourceLanguage,
        targetLanguage: language,
      }),
    )
    return { operation, ...traced }
  }

  /** The SUCCESS run is written with the sheet: it is what marks it as aggregated. */
  @Transactional<TransactionalAdapterPrisma>({
    timeout: SAVE_TRANSACTION_TIMEOUT_MS,
    maxWait: SAVE_TRANSACTION_MAX_WAIT_MS,
  })
  private async save(
    runId: string,
    gameId: string,
    aggregated: AggregationResult,
    elapsedMs: () => number,
  ): Promise<void> {
    await this.gameRepository.lockById(gameId)
    if (aggregated.operation === 'generation') {
      await this.gameRepository.saveGeneratedSheet(aggregated.result)
    } else {
      await this.gameRepository.saveTranslation(aggregated.result)
    }
    await this.gameAggregationRunRepository.recordSuccess({
      runId,
      durationMs: elapsedMs(),
      trace: aggregated.trace,
    })
  }

  private async recordFailure(
    runId: string,
    error: GameAggregationFailedError,
  ): Promise<void> {
    try {
      await this.gameAggregationRunRepository.recordFailure({ runId, error })
    } catch (recordError) {
      // The run stays RUNNING until the abandonment delay.
      this.logger.error(
        { runId, err: recordError },
        'Could not record game aggregation failure',
      )
    }
  }
}
