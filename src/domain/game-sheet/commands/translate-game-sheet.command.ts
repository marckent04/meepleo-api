import { Command } from '@nestjs/cqrs'
import { IsISO6391, IsUUID } from 'class-validator'
import type { GameSheetTranslation, Traced } from '@/shared/types'

export type TranslateGameSheetCommandParams = {
  gameId: string
  /** Source language (ISO 639-1) of an already aggregated sheet. */
  sourceLanguage: string
  /** Language (ISO 639-1) of the translation. */
  targetLanguage: string
}

/** Translates an existing sheet into another language with AI, without persisting it.
 * Also returns the AI call trace (duration, tokens, raw output). */
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
