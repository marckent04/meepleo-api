import { Query } from '@nestjs/cqrs'
import { IsISO6391, IsUUID } from 'class-validator'
import type { GameSheet } from '@/shared/types'

export type GetGameQueryParams = {
  gameId: string
  /** Code ISO 639-1 de la langue de la fiche (ex. `fr`). */
  language: string
}

/**
 * Jeu et sa fiche de règles dans une langue. La fiche est agrégée
 * (générée ou traduite) puis enregistrée à la première demande.
 */
export class GetGameQuery extends Query<GameSheet> {
  @IsUUID()
  readonly gameId: string

  @IsISO6391()
  readonly language: string

  constructor({ gameId, language }: GetGameQueryParams) {
    super()
    this.gameId = gameId
    this.language = language
  }
}
