import { Command } from '@nestjs/cqrs'
import { IsISO6391, IsUUID } from 'class-validator'

export type AddGameToCatalogCommandParams = {
  userId: string
  gameId: string
  /** ISO 639-1 code of the user's language, used to prepare the game sheet. */
  language: string
}

/**
 * Adds a game to the user's catalog. Idempotent. Publishes
 * GameAddedToCatalogEvent so the game sheet is prepared in the background.
 */
export class AddGameToCatalogCommand extends Command<void> {
  @IsUUID()
  readonly userId: string

  @IsUUID()
  readonly gameId: string

  @IsISO6391()
  readonly language: string

  constructor({ userId, gameId, language }: AddGameToCatalogCommandParams) {
    super()
    this.userId = userId
    this.gameId = gameId
    this.language = language
  }
}
