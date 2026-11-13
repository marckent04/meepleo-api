import { Command } from '@nestjs/cqrs'
import { IsUUID } from 'class-validator'

/** Deletes a player (tombstone). Idempotent. */
export class DeletePlayerCommand extends Command<void> {
  @IsUUID()
  readonly userId: string

  @IsUUID()
  readonly id: string

  constructor({ userId, id }: { userId: string; id: string }) {
    super()
    this.userId = userId
    this.id = id
  }
}
