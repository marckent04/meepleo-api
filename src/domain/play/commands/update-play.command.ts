import { Command } from '@nestjs/cqrs'
import {
  IsDate,
  IsISO6391,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator'
import type { Play } from '@/shared/types'
import { PLAY_NOTE_MAX_LENGTH } from './play-inputs'

/** Changes the date or the note of a play; `undefined` keeps the value. */
export class UpdatePlayCommand extends Command<Play> {
  @IsUUID()
  readonly userId: string

  @IsUUID()
  readonly playId: string

  @IsISO6391()
  readonly language: string

  @IsOptional()
  @IsDate()
  readonly playedAt: Date | undefined

  /** null clears the note. */
  @IsOptional()
  @IsString()
  @MaxLength(PLAY_NOTE_MAX_LENGTH)
  readonly note: string | null | undefined

  constructor({
    userId,
    playId,
    language,
    playedAt,
    note,
  }: {
    userId: string
    playId: string
    language: string
    playedAt?: Date
    note?: string | null
  }) {
    super()
    this.userId = userId
    this.playId = playId
    this.language = language
    this.playedAt = playedAt
    this.note = note
  }
}
