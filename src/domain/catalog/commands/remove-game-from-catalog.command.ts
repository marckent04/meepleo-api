import { Command } from '@nestjs/cqrs'
import { IsUUID } from 'class-validator'

/** Removes a game from the user's catalog. Idempotent. */
export class RemoveGameFromCatalogCommand extends Command<void> {
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
