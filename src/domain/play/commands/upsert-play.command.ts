import { Command } from '@nestjs/cqrs'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDate,
  IsIn,
  IsInt,
  IsISO6391,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator'
import {
  type LwwResult,
  PLAY_STATUSES,
  type Play,
  type PlayerShape,
  type PlayScore,
  type PlayStatus,
  type ScoringTemplate,
} from '@/shared/types'
import {
  PLAY_MAX_PLAYERS,
  PLAY_MAX_SCORES,
  PLAY_NOTE_MAX_LENGTH,
  PlayEntryInput,
  PlayScoreInput,
  ScoringTemplateInput,
} from './play-inputs'

/** Whole play content; absent for a tombstone (`deletedAt`). */
export type UpsertPlayContent = {
  gameId: string
  status: PlayStatus
  playedAt: Date
  startedAt: Date | null
  endedAt: Date | null
  durationSeconds: number | null
  firstPlayerId: string | null
  note: string | null
  players: {
    playerId: string
    name: string
    color: string
    shape: PlayerShape
    side: number
    isCurrentUser: boolean
  }[]
  scoring: ScoringTemplate
  scores: PlayScore[]
  winnerSides: number[] | null
}

export type UpsertPlayCommandParams = {
  userId: string
  language: string
  id: string
  createdAt: Date
  updatedAt: Date
  /** Tombstone: the content is ignored. */
  deletedAt: Date | null
  content: UpsertPlayContent | null
}

/**
 * Creates or replaces a whole play identified by a client-generated id (last
 * write wins on `updatedAt`), possibly already completed: the offline-first
 * reference operation. Returns a null play for the tombstone of an unknown play.
 */
export class UpsertPlayCommand extends Command<LwwResult<Play | null>> {
  @IsUUID()
  readonly userId: string

  @IsISO6391()
  readonly language: string

  @IsUUID()
  readonly id: string

  @IsDate()
  readonly createdAt: Date

  @IsDate()
  readonly updatedAt: Date

  @IsOptional()
  @IsDate()
  readonly deletedAt: Date | null

  @ValidateIf((c: UpsertPlayCommand) => c.deletedAt === null)
  @IsUUID()
  readonly gameId: string

  @ValidateIf((c: UpsertPlayCommand) => c.deletedAt === null)
  @IsIn(PLAY_STATUSES)
  readonly status: PlayStatus

  @ValidateIf((c: UpsertPlayCommand) => c.deletedAt === null)
  @IsDate()
  readonly playedAt: Date

  @IsOptional()
  @IsDate()
  readonly startedAt: Date | null

  @IsOptional()
  @IsDate()
  readonly endedAt: Date | null

  @IsOptional()
  @IsInt()
  @Min(0)
  readonly durationSeconds: number | null

  @IsOptional()
  @IsUUID()
  readonly firstPlayerId: string | null

  @IsOptional()
  @IsString()
  @MaxLength(PLAY_NOTE_MAX_LENGTH)
  readonly note: string | null

  @ValidateIf((c: UpsertPlayCommand) => c.deletedAt === null)
  @ArrayMinSize(1)
  @ArrayMaxSize(PLAY_MAX_PLAYERS)
  @ValidateNested({ each: true })
  readonly players: PlayEntryInput[]

  @ValidateIf((c: UpsertPlayCommand) => c.deletedAt === null)
  @ValidateNested()
  readonly scoring: ScoringTemplateInput | null

  @ValidateIf((c: UpsertPlayCommand) => c.deletedAt === null)
  @ArrayMaxSize(PLAY_MAX_SCORES)
  @ValidateNested({ each: true })
  readonly scores: PlayScoreInput[]

  readonly winnerSides: number[] | null

  constructor(params: UpsertPlayCommandParams) {
    super()
    const { content } = params
    this.userId = params.userId
    this.language = params.language
    this.id = params.id
    this.createdAt = params.createdAt
    this.updatedAt = params.updatedAt
    this.deletedAt = params.deletedAt
    this.gameId = content?.gameId as string
    this.status = content?.status as PlayStatus
    this.playedAt = content?.playedAt as Date
    this.startedAt = content?.startedAt ?? null
    this.endedAt = content?.endedAt ?? null
    this.durationSeconds = content?.durationSeconds ?? null
    this.firstPlayerId = content?.firstPlayerId ?? null
    this.note = content?.note ?? null
    this.players = (content?.players ?? []).map(
      (player) => new PlayEntryInput(player),
    )
    this.scoring = content ? new ScoringTemplateInput(content.scoring) : null
    this.scores = (content?.scores ?? []).map(
      (score) => new PlayScoreInput(score),
    )
    this.winnerSides = content?.winnerSides ?? null
  }
}
