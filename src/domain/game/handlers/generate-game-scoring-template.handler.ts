import { CommandHandler } from '@nestjs/cqrs'
import { Transactional } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import { GameScoringTemplateGenerator } from '@/infrastructure/adapters/anthropic'
import {
  GameAggregationRunRepository,
  GameRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { GameAggregationFailedError } from '@/shared/errors'
import type { AiTrace, ScoringTemplate } from '@/shared/types'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { assertValidScoringTemplate } from '../../play/compute-play-result'
import { GenerateGameScoringTemplateCommand } from '../commands'

@CommandHandler(GenerateGameScoringTemplateCommand)
export class GenerateGameScoringTemplateHandler extends AppCommandHandler<
  GenerateGameScoringTemplateCommand,
  void
> {
  constructor(
    private readonly gameRepository: GameRepository,
    private readonly gameAggregationRunRepository: GameAggregationRunRepository,
    private readonly generator: GameScoringTemplateGenerator,
    logger: LoggerService,
  ) {
    super(logger, 'system', GenerateGameScoringTemplateCommand.name)
    this.logger.setContext(GenerateGameScoringTemplateHandler.name)
  }

  /**
   * The AI call happens outside a transaction; only saving the template and
   * the SUCCESS run is transactional. On failure, the run is closed as
   * FAILURE then the error is rethrown. A game without a sheet in the
   * language is skipped.
   */
  async handle({
    gameId,
    language,
  }: GenerateGameScoringTemplateCommand): Promise<void> {
    const sheet = await this.gameRepository.findSheet(gameId, language)
    if (!sheet) {
      this.logger.warn(
        { gameId, language },
        'No sheet to derive a scoring template from',
      )
      return
    }
    const model = this.generator.model
    const runId = await this.gameAggregationRunRepository.start({
      gameId,
      language,
      operation: 'scoring',
      model,
    })
    const start = performance.now()
    try {
      const { result, trace } = await this.generator.generate(sheet)
      assertValidScoringTemplate(result)
      await this.save(runId, gameId, language, result, trace, start)
    } catch (cause) {
      const error = new GameAggregationFailedError({
        operation: 'scoring',
        model,
        durationMs: performance.now() - start,
        cause,
      })
      await this.recordFailure(runId, error)
      throw error
    }
  }

  @Transactional<TransactionalAdapterPrisma>()
  private async save(
    runId: string,
    gameId: string,
    language: string,
    template: ScoringTemplate,
    trace: AiTrace,
    start: number,
  ): Promise<void> {
    await this.gameRepository.saveScoringTemplate(gameId, language, template)
    await this.gameAggregationRunRepository.recordSuccess({
      runId,
      durationMs: performance.now() - start,
      trace,
    })
  }

  private async recordFailure(
    runId: string,
    error: GameAggregationFailedError,
  ): Promise<void> {
    try {
      await this.gameAggregationRunRepository.recordFailure({ runId, error })
    } catch (recordError) {
      this.logger.error(
        { runId, err: recordError },
        'Could not record scoring template failure',
      )
    }
  }
}
