import { QueryHandler } from '@nestjs/cqrs'
import { PlayRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import type { PlaySummary } from '@/shared/types'
import { AppQueryHandler } from '@/utils/cqrs.utils'
import { ListPlaysQuery } from '../queries'

@QueryHandler(ListPlaysQuery)
export class ListPlaysHandler extends AppQueryHandler<
  ListPlaysQuery,
  PlaySummary[]
> {
  constructor(
    private readonly playRepository: PlayRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', ListPlaysQuery.name)
    this.logger.setContext(ListPlaysHandler.name)
  }

  handle({
    userId,
    language,
    gameId,
    limit,
    page,
    status,
    updatedSince,
  }: ListPlaysQuery): Promise<PlaySummary[]> {
    return this.playRepository.listByUser(userId, language, {
      gameId,
      status,
      updatedSince,
      limit,
      offset: (page - 1) * limit,
    })
  }
}
