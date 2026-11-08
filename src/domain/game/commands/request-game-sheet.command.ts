import { Command } from '@nestjs/cqrs'
import { IsISO6391, IsUUID } from 'class-validator'
import type { GameSheetAvailability } from '@/shared/types'

export type RequestGameSheetCommandParams = {
  gameId: string
  /** ISO 639-1 code of the sheet language (e.g. `fr`). */
  language: string
}

/**
 * Requests a game's sheet in a language: returns it if it exists,
 * otherwise reserves its aggregation (RUNNING run, generation if the game has no
 * sheet, translation otherwise) and publishes GameSheetAggregationStartedEvent, unless
 * an aggregation is already in progress. Fast: no AI call.
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
