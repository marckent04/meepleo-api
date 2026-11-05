import { CommandBus, QueryHandler } from '@nestjs/cqrs'
import {
  GameAggregationErrorRepository,
  GameRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { AppError, ErrorCode } from '@/shared/errors'
import type { GameSheet } from '@/shared/types'
import { AppQueryHandler } from '@/utils/cqrs.utils'
import { AggregateGameSheetCommand } from '../commands'
import { GetGameQuery } from '../queries'

@QueryHandler(GetGameQuery)
export class GetGameHandler extends AppQueryHandler<GetGameQuery, GameSheet> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly gameRepository: GameRepository,
    private readonly gameAggregationErrorRepository: GameAggregationErrorRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', GetGameQuery.name)
    this.logger.setContext(GetGameHandler.name)
  }

  async handle({ gameId, language }: GetGameQuery): Promise<GameSheet> {
    const sheet = await this.gameRepository.findSheet(gameId, language)
    if (sheet) return sheet

    try {
      return await this.commandBus.execute(
        new AggregateGameSheetCommand({ gameId, language }),
      )
    } catch (error) {
      // Hors transaction : la trace survit à l'annulation de l'agrégation.
      await this.recordFailure(gameId, language, error)
      throw error
    }
  }

  private async recordFailure(
    gameId: string,
    language: string,
    error: unknown,
  ): Promise<void> {
    // Jeu supprimé entre-temps : la clé étrangère refuserait la trace.
    if (error instanceof AppError && error.code === ErrorCode.GAME_NOT_FOUND) {
      return
    }
    try {
      await this.gameAggregationErrorRepository.record({
        gameId,
        language,
        error,
      })
    } catch (recordError) {
      // Ne masque jamais l'erreur d'origine.
      this.logger.error(
        { gameId, language, err: recordError },
        'Could not record game aggregation error',
      )
    }
  }
}
