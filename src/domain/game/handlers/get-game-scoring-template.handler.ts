import { QueryHandler } from '@nestjs/cqrs'
import { GameRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { DEFAULT_SCORING_TEMPLATE, type ScoringTemplate } from '@/shared/types'
import { AppQueryHandler } from '@/utils/cqrs.utils'
import { GetGameScoringTemplateQuery } from '../queries'

@QueryHandler(GetGameScoringTemplateQuery)
export class GetGameScoringTemplateHandler extends AppQueryHandler<
  GetGameScoringTemplateQuery,
  ScoringTemplate
> {
  constructor(
    private readonly gameRepository: GameRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', GetGameScoringTemplateQuery.name)
    this.logger.setContext(GetGameScoringTemplateHandler.name)
  }

  async handle({
    gameId,
    language,
  }: GetGameScoringTemplateQuery): Promise<ScoringTemplate> {
    // Throws GAME_NOT_FOUND (404) if the game does not exist or is deleted.
    const template = await this.gameRepository.findScoringTemplate(
      gameId,
      language,
    )
    return template ?? DEFAULT_SCORING_TEMPLATE
  }
}
