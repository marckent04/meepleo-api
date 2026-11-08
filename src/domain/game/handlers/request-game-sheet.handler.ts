import { CommandHandler, EventBus } from '@nestjs/cqrs'
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
import {
  ErrorCode,
  type GameAggregationOperation,
  InternalError,
} from '@/shared/errors'
import type {
  GameAggregationRunSummary,
  GameSheetAvailability,
} from '@/shared/types'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { RequestGameSheetCommand } from '../commands'
import { GameSheetAggregationStartedEvent } from '../events'
import {
  AGGREGATION_FAILURE_COOLDOWN_MS,
  AGGREGATION_STALE_AFTER_MS,
} from '../game-sheet-aggregation.constants'

@CommandHandler(RequestGameSheetCommand)
export class RequestGameSheetHandler extends AppCommandHandler<
  RequestGameSheetCommand,
  GameSheetAvailability
> {
  constructor(
    private readonly eventBus: EventBus,
    private readonly gameRepository: GameRepository,
    private readonly gameAggregationRunRepository: GameAggregationRunRepository,
    private readonly gameSheetGenerator: GameSheetGenerator,
    private readonly gameSheetTranslator: GameSheetTranslator,
    logger: LoggerService,
  ) {
    super(logger, 'user', RequestGameSheetCommand.name)
    this.logger.setContext(RequestGameSheetHandler.name)
  }

  async handle({
    gameId,
    language,
  }: RequestGameSheetCommand): Promise<GameSheetAvailability> {
    // Common case, no lock: the sheet already exists.
    const sheet = await this.gameRepository.findSheet(gameId, language)
    if (sheet) return { status: 'ready', sheet }

    const availability = await this.reserve(gameId, language)
    // After the commit: the saga immediately starts the aggregation, which must see the
    // RUNNING run and must not inherit the (closed) transaction client.
    if (availability.status === 'pending' && availability.job) {
      this.eventBus.publish(
        new GameSheetAggregationStartedEvent(availability.job),
      )
    }
    return availability
  }

  /**
   * Short transaction (no AI call): the row lock serializes
   * concurrent requests on the same game, only one creates the run.
   */
  @Transactional<TransactionalAdapterPrisma>()
  private async reserve(
    gameId: string,
    language: string,
  ): Promise<GameSheetAvailability> {
    await this.gameRepository.lockById(gameId)

    const sheet = await this.gameRepository.findSheet(gameId, language)
    if (sheet) return { status: 'ready', sheet }

    const now = Date.now()
    const latest = await this.gameAggregationRunRepository.findLatest(
      gameId,
      language,
    )
    if (latest?.status === 'running') {
      if (now - latest.startedAt.getTime() < AGGREGATION_STALE_AFTER_MS) {
        return { status: 'pending', job: null }
      }
      await this.abandon(latest)
    } else if (
      latest?.status === 'failure' &&
      now - latest.startedAt.getTime() < AGGREGATION_FAILURE_COOLDOWN_MS
    ) {
      throw recentFailure(latest)
    }

    const status = await this.gameRepository.findSheetStatus(gameId)
    const sourceLanguage = status.generated
      ? status.supportedLanguages[0]
      : null
    // A generation in another language is in progress: the translation
    // will start on a later request, once the sheet is generated.
    if (
      !sourceLanguage &&
      (await this.gameAggregationRunRepository.hasRunningGeneration(
        gameId,
        new Date(now - AGGREGATION_STALE_AFTER_MS),
      ))
    ) {
      return { status: 'pending', job: null }
    }

    const operation: GameAggregationOperation = sourceLanguage
      ? 'translation'
      : 'generation'
    const runId = await this.gameAggregationRunRepository.start({
      gameId,
      language,
      operation,
      sourceLanguage,
      model:
        operation === 'generation'
          ? this.gameSheetGenerator.model
          : this.gameSheetTranslator.model,
    })
    this.logger.info(
      { gameId, language, operation, sourceLanguage, runId },
      'Game sheet aggregation started',
    )
    return {
      status: 'pending',
      job: { runId, gameId, language, operation, sourceLanguage },
    }
  }

  private async abandon(run: GameAggregationRunSummary): Promise<void> {
    this.logger.warn(
      { runId: run.id },
      'Abandoning stale game sheet aggregation',
    )
    await this.gameAggregationRunRepository.recordFailure({
      runId: run.id,
      error: new InternalError('Aggregation abandoned: no result in time', {
        code: failureCode(run.operation),
        details: { runId: run.id, startedAt: run.startedAt.toISOString() },
      }),
    })
  }
}

function failureCode(operation: GameAggregationOperation | null): ErrorCode {
  return operation === 'translation'
    ? ErrorCode.GAME_SHEET_TRANSLATION_FAILED
    : ErrorCode.GAME_SHEET_GENERATION_FAILED
}

/** Recent failure returned to the client without restarting the AI; details are in the run. */
function recentFailure(run: GameAggregationRunSummary): InternalError {
  return new InternalError('Game sheet aggregation failed recently', {
    code: failureCode(run.operation),
    details: { runId: run.id, startedAt: run.startedAt.toISOString() },
  })
}
