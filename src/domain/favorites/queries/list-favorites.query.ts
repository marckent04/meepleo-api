import { Query } from '@nestjs/cqrs'
import { IsISO6391, IsUUID } from 'class-validator'
import type { FavoriteEntry } from '@/shared/types'

/** User's favorites, most recently added first. */
export class ListFavoritesQuery extends Query<FavoriteEntry[]> {
  @IsUUID()
  readonly userId: string

  /** ISO 639-1 code of the names' language (e.g. `fr`). */
  @IsISO6391()
  readonly language: string

  constructor({ userId, language }: { userId: string; language: string }) {
    super()
    this.userId = userId
    this.language = language
  }
}
