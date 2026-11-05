import { Query } from '@nestjs/cqrs'
import { IsInt, IsISO6391, IsString, Length, Max, Min } from 'class-validator'
import type { GameSearchResult } from '@/shared/types'

export const SEARCH_GAMES_MIN_LENGTH = 2
export const SEARCH_GAMES_MAX_LENGTH = 100
export const SEARCH_GAMES_MAX_LIMIT = 20

export type SearchGamesQueryParams = {
  search: string
  /** Code ISO 639-1 de la langue des noms (ex. `fr`). */
  language: string
  limit: number
}

/**
 * Jeux dont le nom (canonique ou dans `language`) contient `search`,
 * sans tenir compte de la casse ni des accents. Les noms commençant par
 * `search` d'abord.
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
