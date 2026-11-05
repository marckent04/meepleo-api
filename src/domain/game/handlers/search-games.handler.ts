import { QueryHandler } from '@nestjs/cqrs'
import { GameRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import type { GameSearchResult } from '@/shared/types'
import { AppQueryHandler } from '@/utils/cqrs.utils'
import { SearchGamesQuery } from '../queries'

@QueryHandler(SearchGamesQuery)
export class SearchGamesHandler extends AppQueryHandler<
  SearchGamesQuery,
  GameSearchResult[]
> {
  constructor(
    private readonly gameRepository: GameRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', SearchGamesQuery.name)
    this.logger.setContext(SearchGamesHandler.name)
  }

  handle({
    search,
    language,
    limit,
  }: SearchGamesQuery): Promise<GameSearchResult[]> {
    return this.gameRepository.search(search, language, limit)
  }
}
