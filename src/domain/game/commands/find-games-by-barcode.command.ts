import { Command } from '@nestjs/cqrs'
import { IsISO6391, Matches } from 'class-validator'
import type { GameSearchResult } from '@/shared/types'

/** EAN-8, UPC-A (12), EAN-13 or GTIN-14: digits only. */
export const GAME_BARCODE_PATTERN = /^\d{8,14}$/

export type FindGamesByBarcodeCommandParams = {
  /** EAN / UPC printed on the box. */
  code: string
  /** ISO 639-1 code of the names to return (e.g. `fr`). */
  language: string
}

/**
 * Finds the games sold under a barcode: from our database first, otherwise
 * through the external lookup. Command rather than query: an external lookup
 * saves its result (barcode, new games, localized name, or a miss).
 */
export class FindGamesByBarcodeCommand extends Command<GameSearchResult[]> {
  @Matches(GAME_BARCODE_PATTERN)
  readonly code: string

  @IsISO6391()
  readonly language: string

  constructor({ code, language }: FindGamesByBarcodeCommandParams) {
    super()
    this.code = code
    this.language = language
  }
}
