import { CommandHandler } from '@nestjs/cqrs'
import { GameSheetGenerator } from '@/infrastructure/adapters/anthropic'
import { GameRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import type { GameSheet } from '@/shared/types'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { GenerateGameSheetCommand } from '../commands'

@CommandHandler(GenerateGameSheetCommand)
export class GenerateGameSheetHandler extends AppCommandHandler<
  GenerateGameSheetCommand,
  GameSheet
> {
  constructor(
    private readonly gameRepository: GameRepository,
    private readonly gameSheetGenerator: GameSheetGenerator,
    logger: LoggerService,
  ) {
    super(logger, 'user', GenerateGameSheetCommand.name)
    this.logger.setContext(GenerateGameSheetHandler.name)
  }

  async handle(command: GenerateGameSheetCommand): Promise<GameSheet> {
    const game = await this.gameRepository.findById(command.gameId)
    return this.gameSheetGenerator.generate(game, command.language)
  }
}
