import { Command } from '@nestjs/cqrs'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDate,
  IsIn,
  IsISO6391,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator'
import {
  type Play,
  SCORING_SIDES,
  type ScoringSides,
  type ScoringTemplate,
} from '@/shared/types'
import {
  PLAY_MAX_PLAYERS,
  PLAY_NOTE_MAX_LENGTH,
  PlayerInput,
  ScoringTemplateInput,
} from './play-inputs'

export type CreatePlayCommandParams = {
  userId: string
  gameId: string
  /** ISO 639-1 code of the texts' language (e.g. `fr`). */
  language: string
  /** Defaults to now. */
  playedAt: Date | null
  note: string | null
  players: { name: string; side: number; isCurrentUser: boolean }[]
  /** Template adapted by the user; null = the game's template. */
  scoring: ScoringTemplate | null
  /** Overrides the template's sides (e.g. Wazabi played in teams). */
  sides: ScoringSides | null
}

/**
 * Starts recording a play of a game, with a copy of its score sheet
 * template (the game's, the default one, or the one sent).
 */
export class CreatePlayCommand extends Command<Play> {
  @IsUUID()
  readonly userId: string

  @IsUUID()
  readonly gameId: string

  @IsISO6391()
  readonly language: string

  @ValidateIf((command: CreatePlayCommand) => command.playedAt !== null)
  @IsDate()
  readonly playedAt: Date | null

  @ValidateIf((command: CreatePlayCommand) => command.note !== null)
  @IsString()
  @MaxLength(PLAY_NOTE_MAX_LENGTH)
  readonly note: string | null

  @ArrayMinSize(1)
  @ArrayMaxSize(PLAY_MAX_PLAYERS)
  @ValidateNested({ each: true })
  readonly players: PlayerInput[]

  @ValidateIf((command: CreatePlayCommand) => command.scoring !== null)
  @ValidateNested()
  readonly scoring: ScoringTemplateInput | null

  @ValidateIf((command: CreatePlayCommand) => command.sides !== null)
  @IsIn(SCORING_SIDES)
  readonly sides: ScoringSides | null

  constructor(params: CreatePlayCommandParams) {
    super()
    this.userId = params.userId
    this.gameId = params.gameId
    this.language = params.language
    this.playedAt = params.playedAt
    this.note = params.note
    this.players = params.players.map((player) => new PlayerInput(player))
    this.scoring = params.scoring && new ScoringTemplateInput(params.scoring)
    this.sides = params.sides
  }
}
