import { Command } from '@nestjs/cqrs'
import {
  ArrayMaxSize,
  IsISO6391,
  IsUUID,
  ValidateNested,
} from 'class-validator'
import type { Play, PlayScore } from '@/shared/types'
import { PLAY_MAX_SCORES, PlayScoreInput } from './play-inputs'

/**
 * Replaces the whole score sheet of a play in progress and recomputes the
 * totals and ranks. Cells left out are empty (worth 0).
 */
export class SavePlayScoresCommand extends Command<Play> {
  @IsUUID()
  readonly userId: string

  @IsUUID()
  readonly playId: string

  @IsISO6391()
  readonly language: string

  @ArrayMaxSize(PLAY_MAX_SCORES)
  @ValidateNested({ each: true })
  readonly scores: PlayScoreInput[]

  constructor({
    userId,
    playId,
    language,
    scores,
  }: {
    userId: string
    playId: string
    language: string
    scores: PlayScore[]
  }) {
    super()
    this.userId = userId
    this.playId = playId
    this.language = language
    this.scores = scores.map((score) => new PlayScoreInput(score))
  }
}
