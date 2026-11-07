import { CommandHandler } from '@nestjs/cqrs'
import { UserGameRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { RemoveGameFromWishlistCommand } from '../commands'

@CommandHandler(RemoveGameFromWishlistCommand)
export class RemoveGameFromWishlistHandler extends AppCommandHandler<
  RemoveGameFromWishlistCommand,
  void
> {
  constructor(
    private readonly userGameRepository: UserGameRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', RemoveGameFromWishlistCommand.name)
    this.logger.setContext(RemoveGameFromWishlistHandler.name)
  }

  handle({ userId, gameId }: RemoveGameFromWishlistCommand): Promise<void> {
    return this.userGameRepository.remove(userId, gameId, 'wishlist')
  }
}
