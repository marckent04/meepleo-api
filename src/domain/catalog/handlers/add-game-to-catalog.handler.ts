import { CommandHandler } from '@nestjs/cqrs'
import {
  GameRepository,
  UserGameRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { AddGameToCatalogCommand } from '../commands'

@CommandHandler(AddGameToCatalogCommand)
export class AddGameToCatalogHandler extends AppCommandHandler<
  AddGameToCatalogCommand,
  void
> {
  constructor(
    private readonly gameRepository: GameRepository,
    private readonly userGameRepository: UserGameRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', AddGameToCatalogCommand.name)
    this.logger.setContext(AddGameToCatalogHandler.name)
  }

  async handle({ userId, gameId }: AddGameToCatalogCommand): Promise<void> {
    // Lève GAME_NOT_FOUND (404) si le jeu n'existe pas ou est supprimé.
    await this.gameRepository.findById(gameId)
    await this.userGameRepository.add(userId, gameId, 'owned')
  }
}
