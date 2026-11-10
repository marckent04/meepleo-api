import { Query } from '@nestjs/cqrs'
import { IsISO6391, IsUUID } from 'class-validator'
import type { Play } from '@/shared/types'

/** Play of the user, with its score sheet. */
export class GetPlayQuery extends Query<Play> {
  @IsUUID()
  readonly userId: string

  @IsUUID()
  readonly playId: string

  /** ISO 639-1 code of the game name's language (e.g. `fr`). */
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
