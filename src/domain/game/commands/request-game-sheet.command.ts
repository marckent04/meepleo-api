import { Command } from '@nestjs/cqrs'
import { IsISO6391, IsUUID } from 'class-validator'
import type { GameSheetAvailability } from '@/shared/types'

export type RequestGameSheetCommandParams = {
  gameId: string
  /** Code ISO 639-1 de la langue de la fiche (ex. `fr`). */
  language: string
}

/**
 * Demande la fiche d'un jeu dans une langue : la renvoie si elle existe,
 * sinon réserve son agrégation (run RUNNING, génération si le jeu n'a aucune
 * fiche, traduction sinon) et publie GameSheetAggregationStartedEvent, sauf si
 * une agrégation est déjà en cours. Rapide : aucun appel à l'IA.
 */
export class RequestGameSheetCommand extends Command<GameSheetAvailability> {
  @IsUUID()
  readonly gameId: string

  @IsISO6391()
  readonly language: string

  constructor({ gameId, language }: RequestGameSheetCommandParams) {
    super()
    this.gameId = gameId
    this.language = language
  }
}
