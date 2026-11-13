import { QueryHandler } from '@nestjs/cqrs'
import { UserGameRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import type { CatalogEntry } from '@/shared/types'
import { AppQueryHandler } from '@/utils/cqrs.utils'
import { ListWishlistQuery } from '../queries'

@QueryHandler(ListWishlistQuery)
export class ListWishlistHandler extends AppQueryHandler<
  ListWishlistQuery,
  CatalogEntry[]
> {
  constructor(
    private readonly userGameRepository: UserGameRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', ListWishlistQuery.name)
    this.logger.setContext(ListWishlistHandler.name)
  }

  handle({
    userId,
    language,
    updatedSince,
  }: ListWishlistQuery): Promise<CatalogEntry[]> {
    return this.userGameRepository.listByUser(
      userId,
      language,
      'wishlist',
      updatedSince ?? undefined,
    )
  }
}
