import { Query } from '@nestjs/cqrs'
import { IsISO6391, IsUUID } from 'class-validator'
import type { CatalogEntry } from '@/shared/types'

/** User's wishlist, most recently added first. */
export class ListWishlistQuery extends Query<CatalogEntry[]> {
  @IsUUID()
  readonly userId: string

  /** ISO 639-1 code of the names language (e.g. `fr`). */
  @IsISO6391()
  readonly language: string

  constructor({ userId, language }: { userId: string; language: string }) {
    super()
    this.userId = userId
    this.language = language
  }
}
