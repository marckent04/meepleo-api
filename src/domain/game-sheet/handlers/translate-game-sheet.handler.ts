import { CommandHandler } from '@nestjs/cqrs'
import { GameSheetTranslator } from '@/infrastructure/adapters/anthropic'
import { GameRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { NotFoundError } from '@/shared/errors'
import type { GameSheetTranslation } from '@/shared/types'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { TranslateGameSheetCommand } from '../commands'

@CommandHandler(TranslateGameSheetCommand)
export class TranslateGameSheetHandler extends AppCommandHandler<
  TranslateGameSheetCommand,
  GameSheetTranslation
> {
  constructor(
    private readonly gameRepository: GameRepository,
    private readonly gameSheetTranslator: GameSheetTranslator,
    logger: LoggerService,
  ) {
    super(logger, 'system', TranslateGameSheetCommand.name)
    this.logger.setContext(TranslateGameSheetHandler.name)
  }

  async handle(
    command: TranslateGameSheetCommand,
  ): Promise<GameSheetTranslation> {
    const sheet = await this.gameRepository.findSheet(
      command.gameId,
      command.sourceLanguage,
    )
    if (!sheet) {
      throw new NotFoundError('Source game sheet not found', {
        details: {
          gameId: command.gameId,
          sourceLanguage: command.sourceLanguage,
        },
      })
    }
    return this.gameSheetTranslator.translate(sheet, command.targetLanguage)
  }
}
