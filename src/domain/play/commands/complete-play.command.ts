import { Command } from '@nestjs/cqrs'
import {
  ArrayMaxSize,
  IsInt,
  IsISO6391,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator'
import type { Play } from '@/shared/types'
import { PLAY_MAX_PLAYERS } from './play-inputs'

/**
 * Ends a play and designates its winners: the sides ranked first, unless
 * `winnerSides` is given (required for a manual outcome; empty = nobody won,
 * e.g. a lost cooperative game). Completing again changes the winners.
 */
export class CompletePlayCommand extends Command<Play> {
  @IsUUID()
  readonly userId: string

  @IsUUID()
  readonly playId: string

  @IsISO6391()
  readonly language: string

  @ValidateIf((command: CompletePlayCommand) => command.winnerSides !== null)
  @ArrayMaxSize(PLAY_MAX_PLAYERS)
  @IsInt({ each: true })
  @Min(0, { each: true })
  readonly winnerSides: number[] | null

  constructor({
    userId,
    playId,
    language,
    winnerSides,
  }: {
    userId: string
    playId: string
    language: string
    winnerSides: number[] | null
  }) {
    super()
    this.userId = userId
    this.playId = playId
    this.language = language
    this.winnerSides = winnerSides
  }
}
