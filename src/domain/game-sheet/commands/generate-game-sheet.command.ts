import { Command } from '@nestjs/cqrs'
import { IsISO6391, IsUUID } from 'class-validator'
import type { GameSheet } from '@/shared/types'

export type GenerateGameSheetCommandParams = {
  gameId: string
  /** Code ISO 639-1 de la langue de la fiche (ex. `fr`). */
  language: string
}

/** Génère par IA la fiche de règles d'un jeu dans une langue, sans la persister. */
export class GenerateGameSheetCommand extends Command<GameSheet> {
  @IsUUID()
  readonly gameId: string

  @IsISO6391()
  readonly language: string

  constructor({ gameId, language }: GenerateGameSheetCommandParams) {
    super()
    this.gameId = gameId
    this.language = language
  }
}
