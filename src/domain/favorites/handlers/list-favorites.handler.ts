import { QueryHandler } from '@nestjs/cqrs'
import { UserFavoriteRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import type { FavoriteEntry } from '@/shared/types'
import { AppQueryHandler } from '@/utils/cqrs.utils'
import { ListFavoritesQuery } from '../queries'

@QueryHandler(ListFavoritesQuery)
export class ListFavoritesHandler extends AppQueryHandler<
  ListFavoritesQuery,
  FavoriteEntry[]
> {
  constructor(
    private readonly userFavoriteRepository: UserFavoriteRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', ListFavoritesQuery.name)
    this.logger.setContext(ListFavoritesHandler.name)
  }

  handle({ userId, language }: ListFavoritesQuery): Promise<FavoriteEntry[]> {
    return this.userFavoriteRepository.listByUser(userId, language)
  }
}
