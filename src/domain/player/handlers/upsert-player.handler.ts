import { CommandHandler } from '@nestjs/cqrs'
import { PlayerRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import type { LwwResult, Player } from '@/shared/types'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { clampFutureDate } from '@/utils/last-write-wins'
import { UpsertPlayerCommand } from '../commands'

@CommandHandler(UpsertPlayerCommand)
export class UpsertPlayerHandler extends AppCommandHandler<
  UpsertPlayerCommand,
  LwwResult<Player>
> {
  constructor(
    private readonly playerRepository: PlayerRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', UpsertPlayerCommand.name)
    this.logger.setContext(UpsertPlayerHandler.name)
  }

  handle(command: UpsertPlayerCommand): Promise<LwwResult<Player>> {
    const now = new Date()
    return this.playerRepository.upsertLww(command.userId, {
      id: command.id,
      name: command.name,
      color: command.color,
      shape: command.shape,
      handle: command.handle,
      isCurrentUser: command.isCurrentUser,
      createdAt: command.createdAt,
      updatedAt: clampFutureDate(command.updatedAt, now),
      deletedAt: command.deletedAt,
    })
  }
}
