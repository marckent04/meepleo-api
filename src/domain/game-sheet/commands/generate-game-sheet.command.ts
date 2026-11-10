import { Command } from '@nestjs/cqrs'
import { IsISO6391, IsUUID } from 'class-validator'
import type { GeneratedGameSheet, Traced } from '@/shared/types'

export type GenerateGameSheetCommandParams = {
  gameId: string
  /** ISO 639-1 code of the sheet language (e.g. `fr`). */
  language: string
}

/** Generates with AI a game's rule sheet in a language, without persisting it.
 * Also returns the AI call trace (duration, tokens, raw output). */
export class GenerateGameSheetCommand extends Command<
  Traced<GeneratedGameSheet>
> {
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
