import { Query } from '@nestjs/cqrs'
import { IsDate, IsISO6391, IsOptional, IsUUID } from 'class-validator'
import type { CatalogEntry } from '@/shared/types'

/** User's wishlist, most recently added first. */
export class ListWishlistQuery extends Query<CatalogEntry[]> {
  @IsUUID()
  readonly userId: string

  /** ISO 639-1 code of the names language (e.g. `fr`). */
  @IsISO6391()
  readonly language: string

  /** Includes tombstones of games modified after this date. */
  @IsOptional()
  @IsDate()
  readonly updatedSince: Date | null

  constructor({
    userId,
    language,
    updatedSince,
  }: {
    userId: string
    language: string
    updatedSince?: Date | null
  }) {
    super()
    this.userId = userId
    this.language = language
    this.updatedSince = updatedSince ?? null
  }
}
