import { CommandHandler } from '@nestjs/cqrs'
import {
  GameRepository,
  UserFavoriteRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { AddGameToFavoritesCommand } from '../commands'

@CommandHandler(AddGameToFavoritesCommand)
export class AddGameToFavoritesHandler extends AppCommandHandler<
  AddGameToFavoritesCommand,
  void
> {
  constructor(
    private readonly gameRepository: GameRepository,
    private readonly userFavoriteRepository: UserFavoriteRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', AddGameToFavoritesCommand.name)
    this.logger.setContext(AddGameToFavoritesHandler.name)
  }

  async handle({ userId, gameId }: AddGameToFavoritesCommand): Promise<void> {
    // Throws GAME_NOT_FOUND (404) if the game does not exist or is deleted.
    await this.gameRepository.findById(gameId)
    await this.userFavoriteRepository.add(userId, gameId)
  }
}
