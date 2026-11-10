import { CommandHandler, EventBus } from '@nestjs/cqrs'
import {
  GameRepository,
  UserGameRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { AddGameToCatalogCommand } from '../commands'
import { GameAddedToCatalogEvent } from '../events'

@CommandHandler(AddGameToCatalogCommand)
export class AddGameToCatalogHandler extends AppCommandHandler<
  AddGameToCatalogCommand,
  void
> {
  constructor(
    private readonly eventBus: EventBus,
    private readonly gameRepository: GameRepository,
    private readonly userGameRepository: UserGameRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', AddGameToCatalogCommand.name)
    this.logger.setContext(AddGameToCatalogHandler.name)
  }

  async handle({
    userId,
    gameId,
    language,
  }: AddGameToCatalogCommand): Promise<void> {
    // Throws GAME_NOT_FOUND (404) if the game does not exist or is deleted.
    await this.gameRepository.findById(gameId)
    await this.userGameRepository.add(userId, gameId, 'owned')
    // Prepares the game sheet in the background to spare the wait on first play.
    this.eventBus.publish(new GameAddedToCatalogEvent(userId, gameId, language))
  }
}
