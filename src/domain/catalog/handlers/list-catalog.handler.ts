import { QueryHandler } from '@nestjs/cqrs'
import { UserGameRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import type { CatalogEntry } from '@/shared/types'
import { AppQueryHandler } from '@/utils/cqrs.utils'
import { ListCatalogQuery } from '../queries'

@QueryHandler(ListCatalogQuery)
export class ListCatalogHandler extends AppQueryHandler<
  ListCatalogQuery,
  CatalogEntry[]
> {
  constructor(
    private readonly userGameRepository: UserGameRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', ListCatalogQuery.name)
    this.logger.setContext(ListCatalogHandler.name)
  }

  handle({ userId, language }: ListCatalogQuery): Promise<CatalogEntry[]> {
    return this.userGameRepository.listByUser(userId, language)
  }
}
