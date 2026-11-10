import { Command } from '@nestjs/cqrs'
import { IsISO6391, IsUUID } from 'class-validator'

export type AddGameToWishlistCommandParams = {
  userId: string
  gameId: string
  /** ISO 639-1 code of the user's language, used to prepare the game sheet. */
  language: string
}

/**
 * Adds a game to the user's wishlist. Idempotent. Publishes
 * GameAddedToWishlistEvent so the game sheet is prepared in the background.
 */
export class AddGameToWishlistCommand extends Command<void> {
  @IsUUID()
  readonly userId: string

  @IsUUID()
  readonly gameId: string

  @IsISO6391()
  readonly language: string

  constructor({ userId, gameId, language }: AddGameToWishlistCommandParams) {
    super()
    this.userId = userId
    this.gameId = gameId
    this.language = language
  }
}
