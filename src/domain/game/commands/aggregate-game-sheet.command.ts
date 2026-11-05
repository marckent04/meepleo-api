import { Command } from '@nestjs/cqrs'
import { IsISO6391, IsUUID } from 'class-validator'
import type { GameSheet } from '@/shared/types'

export type AggregateGameSheetCommandParams = {
  gameId: string
  /** Code ISO 639-1 de la langue de la fiche (ex. `fr`). */
  language: string
}

/**
 * Produit et enregistre la fiche d'un jeu dans une langue, sous verrou :
 * génération si le jeu n'a aucune fiche, traduction sinon.
 */
export class AggregateGameSheetCommand extends Command<GameSheet> {
  @IsUUID()
  readonly gameId: string

  @IsISO6391()
  readonly language: string

  constructor({ gameId, language }: AggregateGameSheetCommandParams) {
    super()
    this.gameId = gameId
    this.language = language
  }
}
