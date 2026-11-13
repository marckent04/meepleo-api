import { QueryHandler } from '@nestjs/cqrs'
import { PlayerRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import type { Player } from '@/shared/types'
import { AppQueryHandler } from '@/utils/cqrs.utils'
import { ListPlayersQuery } from '../queries'

@QueryHandler(ListPlayersQuery)
export class ListPlayersHandler extends AppQueryHandler<
  ListPlayersQuery,
  Player[]
> {
  constructor(
    private readonly playerRepository: PlayerRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', ListPlayersQuery.name)
    this.logger.setContext(ListPlayersHandler.name)
  }

  handle({ userId, updatedSince }: ListPlayersQuery): Promise<Player[]> {
    return this.playerRepository.listByUser(userId, updatedSince ?? undefined)
  }
}
