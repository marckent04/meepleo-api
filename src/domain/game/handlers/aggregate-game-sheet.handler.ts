import { CommandBus, CommandHandler } from '@nestjs/cqrs'
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
import type { GameSheet } from '@/shared/types'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import {
  GenerateGameSheetCommand,
  TranslateGameSheetCommand,
} from '../../game-sheet/commands'
import { AggregateGameSheetCommand } from '../commands'

/** Une génération (recherche web) peut durer plusieurs minutes. */
const AGGREGATION_TIMEOUT_MS = 180_000
/** Attente maximale d'une connexion pour ouvrir la transaction. */
const AGGREGATION_MAX_WAIT_MS = 10_000

@CommandHandler(AggregateGameSheetCommand)
export class AggregateGameSheetHandler extends AppCommandHandler<
  AggregateGameSheetCommand,
  GameSheet
> {
  constructor(
    private readonly commandBus: CommandBus,
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
   * Le verrou de ligne fait attendre les requêtes concurrentes sur le même
   * jeu ; après l'attente, elles trouvent la fiche déjà enregistrée.
   * Le run SUCCESS est écrit dans la même transaction que la fiche : c'est lui
   * qui la marque comme générée.
   */
  @Transactional<TransactionalAdapterPrisma>({
    timeout: AGGREGATION_TIMEOUT_MS,
    maxWait: AGGREGATION_MAX_WAIT_MS,
  })
  async handle({
    gameId,
    language,
  }: AggregateGameSheetCommand): Promise<GameSheet> {
    await this.gameRepository.lockById(gameId)

    const existing = await this.gameRepository.findSheet(gameId, language)
    if (existing) return existing

    const status = await this.gameRepository.findSheetStatus(gameId)
    const sourceLanguage = status.generated
      ? status.supportedLanguages[0]
      : undefined

    if (sourceLanguage) {
      await this.translate(gameId, sourceLanguage, language)
    } else {
      await this.generate(gameId, language)
    }

    const sheet = await this.gameRepository.findSheet(gameId, language)
    if (!sheet) {
      throw new Error(`Game sheet ${gameId} not aggregated in ${language}`)
    }
    return sheet
  }

  private async generate(gameId: string, language: string): Promise<void> {
    const model = this.gameSheetGenerator.model
    this.logger.info({ gameId, language, model }, 'Generating game sheet')
    const start = performance.now()
    try {
      const { result: sheet, trace } = await this.commandBus.execute(
        new GenerateGameSheetCommand({ gameId, language }),
      )
      await this.gameRepository.saveGeneratedSheet(sheet)
      await this.gameAggregationRunRepository.recordSuccess({
        gameId,
        language,
        operation: 'generation',
        durationMs: performance.now() - start,
        trace,
      })
    } catch (cause) {
      throw new GameAggregationFailedError({
        operation: 'generation',
        model,
        durationMs: performance.now() - start,
        cause,
      })
    }
  }

  private async translate(
    gameId: string,
    sourceLanguage: string,
    language: string,
  ): Promise<void> {
    const model = this.gameSheetTranslator.model
    this.logger.info(
      { gameId, sourceLanguage, language, model },
      'Translating game sheet',
    )
    const start = performance.now()
    try {
      const { result: translation, trace } = await this.commandBus.execute(
        new TranslateGameSheetCommand({
          gameId,
          sourceLanguage,
          targetLanguage: language,
        }),
      )
      await this.gameRepository.saveTranslation(translation)
      await this.gameAggregationRunRepository.recordSuccess({
        gameId,
        language,
        operation: 'translation',
        sourceLanguage,
        durationMs: performance.now() - start,
        trace,
      })
    } catch (cause) {
      throw new GameAggregationFailedError({
        operation: 'translation',
        model,
        sourceLanguage,
        durationMs: performance.now() - start,
        cause,
      })
    }
  }
}
