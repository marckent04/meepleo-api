import { CommandHandler } from '@nestjs/cqrs'
import { GroupRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { DeleteGroupCommand } from '../commands'

@CommandHandler(DeleteGroupCommand)
export class DeleteGroupHandler extends AppCommandHandler<
  DeleteGroupCommand,
  void
> {
  constructor(
    private readonly groupRepository: GroupRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', DeleteGroupCommand.name)
    this.logger.setContext(DeleteGroupHandler.name)
  }

  handle({ userId, id }: DeleteGroupCommand): Promise<void> {
    return this.groupRepository.softDelete(userId, id, new Date())
  }
}
