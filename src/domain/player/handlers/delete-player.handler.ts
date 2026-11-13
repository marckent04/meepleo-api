import { CommandHandler } from '@nestjs/cqrs'
import { PlayerRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { DeletePlayerCommand } from '../commands'

@CommandHandler(DeletePlayerCommand)
export class DeletePlayerHandler extends AppCommandHandler<
  DeletePlayerCommand,
  void
> {
  constructor(
    private readonly playerRepository: PlayerRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', DeletePlayerCommand.name)
    this.logger.setContext(DeletePlayerHandler.name)
  }

  handle({ userId, id }: DeletePlayerCommand): Promise<void> {
    return this.playerRepository.softDelete(userId, id, new Date())
  }
}
