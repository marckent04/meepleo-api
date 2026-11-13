import { Query } from '@nestjs/cqrs'
import {
  IsDate,
  IsIn,
  IsInt,
  IsISO6391,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator'
import {
  PLAY_STATUSES,
  type PlayStatus,
  type PlaySummary,
} from '@/shared/types'
import { LIST_PLAYS_MAX_LIMIT } from '../commands/play-inputs'

/** User's plays, most recently played first, optionally of a single game. */
export class ListPlaysQuery extends Query<PlaySummary[]> {
  @IsUUID()
  readonly userId: string

  /** ISO 639-1 code of the game names' language (e.g. `fr`). */
  @IsISO6391()
  readonly language: string

  @ValidateIf((query: ListPlaysQuery) => query.gameId !== null)
  @IsUUID()
  readonly gameId: string | null

  @IsInt()
  @Min(1)
  @Max(LIST_PLAYS_MAX_LIMIT)
  readonly limit: number

  /** Page number (from 1) of `limit` plays. */
  @IsInt()
  @Min(1)
  readonly page: number

  @ValidateIf((query: ListPlaysQuery) => query.status !== null)
  @IsIn(PLAY_STATUSES)
  readonly status: PlayStatus | null

  /** Includes tombstones of plays modified after this date. */
  @ValidateIf((query: ListPlaysQuery) => query.updatedSince !== null)
  @IsDate()
  readonly updatedSince: Date | null

  constructor({
    userId,
    language,
    gameId,
    limit,
    page,
    status,
    updatedSince,
  }: {
    userId: string
    language: string
    gameId: string | null
    limit: number
    page?: number
    status?: PlayStatus | null
    updatedSince?: Date | null
  }) {
    super()
    this.userId = userId
    this.language = language
    this.gameId = gameId
    this.limit = limit
    this.page = page ?? 1
    this.status = status ?? null
    this.updatedSince = updatedSince ?? null
  }
}
