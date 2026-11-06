import { Command } from '@nestjs/cqrs'
import { IsISO6391, IsUUID } from 'class-validator'
import type { GameSheetTranslation, Traced } from '@/shared/types'

export type TranslateGameSheetCommandParams = {
  gameId: string
  /** Langue (ISO 639-1) d'une fiche déjà agrégée. */
  sourceLanguage: string
  /** Langue (ISO 639-1) de la traduction. */
  targetLanguage: string
}

/** Traduit par IA une fiche existante dans une autre langue, sans la persister.
 * Renvoie aussi la trace de l'appel à l'IA (durée, tokens, sortie brute). */
export class TranslateGameSheetCommand extends Command<
  Traced<GameSheetTranslation>
> {
  @IsUUID()
  readonly gameId: string

  @IsISO6391()
  readonly sourceLanguage: string

  @IsISO6391()
  readonly targetLanguage: string

  constructor({
    gameId,
    sourceLanguage,
    targetLanguage,
  }: TranslateGameSheetCommandParams) {
    super()
    this.gameId = gameId
    this.sourceLanguage = sourceLanguage
    this.targetLanguage = targetLanguage
  }
}
