import { Command } from '@nestjs/cqrs'
import { IsUUID } from 'class-validator'

/** Deletes a play of the user. Idempotent. */
export class DeletePlayCommand extends Command<void> {
  @IsUUID()
  readonly userId: string

  @IsUUID()
  readonly playId: string

  constructor({ userId, playId }: { userId: string; playId: string }) {
    super()
    this.userId = userId
    this.playId = playId
  }
}
