import { Command } from '@nestjs/cqrs'
import { IsUUID } from 'class-validator'

/** Retire un jeu de la liste de souhaits de l'utilisateur. Idempotent. */
export class RemoveGameFromWishlistCommand extends Command<void> {
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
