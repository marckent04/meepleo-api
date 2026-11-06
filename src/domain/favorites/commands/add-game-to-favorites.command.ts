import { Command } from '@nestjs/cqrs'
import { IsUUID } from 'class-validator'

/** Adds a game to the user's favorites. Idempotent. */
export class AddGameToFavoritesCommand extends Command<void> {
  @IsUUID()
  readonly userId: string

  @IsUUID()
  readonly gameId: string

  constructor({ userId, gameId }: { userId: string; gameId: string }) {
    super()
    this.userId = userId
    this.gameId = gameId
  }
}
