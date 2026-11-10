import { Command } from '@nestjs/cqrs'
import { IsISO6391, IsUUID } from 'class-validator'

/**
 * Derives the score sheet template of a game from its sheet in `language`
 * and saves it, replacing the previous one (plays keep their own copy).
 * Traced as a `scoring` run. Long (AI call): started in the background by
 * GameSheetSagas once a sheet is generated, outside any transaction.
 */
export class GenerateGameScoringTemplateCommand extends Command<void> {
  @IsUUID()
  readonly gameId: string

  @IsISO6391()
  readonly language: string

  constructor({ gameId, language }: { gameId: string; language: string }) {
    super()
    this.gameId = gameId
    this.language = language
  }
}
