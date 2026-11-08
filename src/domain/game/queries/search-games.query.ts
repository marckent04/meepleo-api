import { Query } from '@nestjs/cqrs'
import { IsInt, IsISO6391, IsString, Length, Max, Min } from 'class-validator'
import type { GameSearchResult } from '@/shared/types'

export const SEARCH_GAMES_MIN_LENGTH = 2
export const SEARCH_GAMES_MAX_LENGTH = 100
export const SEARCH_GAMES_MAX_LIMIT = 20

export type SearchGamesQueryParams = {
  search: string
  /** ISO 639-1 code of the names language (e.g. `fr`). */
  language: string
  limit: number
}

/**
 * Games whose name (canonical or in `language`) contains `search`,
 * ignoring case and accents. Names starting with
 * `search` first.
 */
export class SearchGamesQuery extends Query<GameSearchResult[]> {
  @IsString()
  @Length(SEARCH_GAMES_MIN_LENGTH, SEARCH_GAMES_MAX_LENGTH)
  readonly search: string

  @IsISO6391()
  readonly language: string

  @IsInt()
  @Min(1)
  @Max(SEARCH_GAMES_MAX_LIMIT)
  readonly limit: number

  constructor({ search, language, limit }: SearchGamesQueryParams) {
    super()
    this.search = search
    this.language = language
    this.limit = limit
  }
}
