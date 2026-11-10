import { CommandHandler } from '@nestjs/cqrs'
import { PlayRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { DeletePlayCommand } from '../commands'

@CommandHandler(DeletePlayCommand)
export class DeletePlayHandler extends AppCommandHandler<
  DeletePlayCommand,
  void
> {
  constructor(
    private readonly playRepository: PlayRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', DeletePlayCommand.name)
    this.logger.setContext(DeletePlayHandler.name)
  }

  handle({ userId, playId }: DeletePlayCommand): Promise<void> {
    return this.playRepository.softDelete(playId, userId)
  }
}
