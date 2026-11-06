import { CommandHandler } from '@nestjs/cqrs'
import { UserFavoriteRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { RemoveGameFromFavoritesCommand } from '../commands'

@CommandHandler(RemoveGameFromFavoritesCommand)
export class RemoveGameFromFavoritesHandler extends AppCommandHandler<
  RemoveGameFromFavoritesCommand,
  void
> {
  constructor(
    private readonly userFavoriteRepository: UserFavoriteRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', RemoveGameFromFavoritesCommand.name)
    this.logger.setContext(RemoveGameFromFavoritesHandler.name)
  }

  handle({ userId, gameId }: RemoveGameFromFavoritesCommand): Promise<void> {
    return this.userFavoriteRepository.remove(userId, gameId)
  }
}
