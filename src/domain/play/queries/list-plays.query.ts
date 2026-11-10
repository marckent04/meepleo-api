import { Query } from '@nestjs/cqrs'
import { IsInt, IsISO6391, IsUUID, Max, Min, ValidateIf } from 'class-validator'
import type { PlaySummary } from '@/shared/types'
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

  constructor({
    userId,
    language,
    gameId,
    limit,
  }: {
    userId: string
    language: string
    gameId: string | null
    limit: number
  }) {
    super()
    this.userId = userId
    this.language = language
    this.gameId = gameId
    this.limit = limit
  }
}
