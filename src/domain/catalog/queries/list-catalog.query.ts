import { Query } from '@nestjs/cqrs'
import { IsISO6391, IsUUID } from 'class-validator'
import type { CatalogEntry } from '@/shared/types'

/** Catalogue de l'utilisateur, les derniers ajouts d'abord. */
export class ListCatalogQuery extends Query<CatalogEntry[]> {
  @IsUUID()
  readonly userId: string

  /** Code ISO 639-1 de la langue des noms (ex. `fr`). */
  @IsISO6391()
  readonly language: string

  constructor({ userId, language }: { userId: string; language: string }) {
    super()
    this.userId = userId
    this.language = language
  }
}
