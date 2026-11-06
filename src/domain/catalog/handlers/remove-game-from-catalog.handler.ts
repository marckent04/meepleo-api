import { CommandHandler } from '@nestjs/cqrs'
import { UserGameRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { RemoveGameFromCatalogCommand } from '../commands'

@CommandHandler(RemoveGameFromCatalogCommand)
export class RemoveGameFromCatalogHandler extends AppCommandHandler<
  RemoveGameFromCatalogCommand,
  void
> {
  constructor(
    private readonly userGameRepository: UserGameRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', RemoveGameFromCatalogCommand.name)
    this.logger.setContext(RemoveGameFromCatalogHandler.name)
  }

  handle({ userId, gameId }: RemoveGameFromCatalogCommand): Promise<void> {
    return this.userGameRepository.remove(userId, gameId)
  }
}
