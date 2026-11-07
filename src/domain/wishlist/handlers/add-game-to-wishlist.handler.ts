import { CommandHandler } from '@nestjs/cqrs'
import {
  GameRepository,
  UserGameRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { AddGameToWishlistCommand } from '../commands'

@CommandHandler(AddGameToWishlistCommand)
export class AddGameToWishlistHandler extends AppCommandHandler<
  AddGameToWishlistCommand,
  void
> {
  constructor(
    private readonly gameRepository: GameRepository,
    private readonly userGameRepository: UserGameRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', AddGameToWishlistCommand.name)
    this.logger.setContext(AddGameToWishlistHandler.name)
  }

  async handle({ userId, gameId }: AddGameToWishlistCommand): Promise<void> {
    // Lève GAME_NOT_FOUND (404) si le jeu n'existe pas ou est supprimé.
    await this.gameRepository.findById(gameId)
    await this.userGameRepository.add(userId, gameId, 'wishlist')
  }
}
