import { Command } from '@nestjs/cqrs'
import { IsISO6391, IsUUID } from 'class-validator'
import type { Play } from '@/shared/types'

/** Puts a completed play back in progress, without winners. Idempotent. */
export class ReopenPlayCommand extends Command<Play> {
  @IsUUID()
  readonly userId: string

  @IsUUID()
  readonly playId: string

  @IsISO6391()
  readonly language: string

  constructor({
    userId,
    playId,
    language,
  }: {
    userId: string
    playId: string
    language: string
  }) {
    super()
    this.userId = userId
    this.playId = playId
    this.language = language
  }
}
