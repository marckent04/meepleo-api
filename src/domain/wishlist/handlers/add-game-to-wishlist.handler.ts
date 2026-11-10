import { CommandHandler, EventBus } from '@nestjs/cqrs'
import {
  GameRepository,
  UserGameRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { AddGameToWishlistCommand } from '../commands'
import { GameAddedToWishlistEvent } from '../events'

@CommandHandler(AddGameToWishlistCommand)
export class AddGameToWishlistHandler extends AppCommandHandler<
  AddGameToWishlistCommand,
  void
> {
  constructor(
    private readonly eventBus: EventBus,
    private readonly gameRepository: GameRepository,
    private readonly userGameRepository: UserGameRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', AddGameToWishlistCommand.name)
    this.logger.setContext(AddGameToWishlistHandler.name)
  }

  async handle({
    userId,
    gameId,
    language,
  }: AddGameToWishlistCommand): Promise<void> {
    // Throws GAME_NOT_FOUND (404) if the game does not exist or is deleted.
    await this.gameRepository.findById(gameId)
    await this.userGameRepository.add(userId, gameId, 'wishlist')
    // Prepares the game sheet in the background to spare the wait on first play.
    this.eventBus.publish(
      new GameAddedToWishlistEvent(userId, gameId, language),
    )
  }
}
