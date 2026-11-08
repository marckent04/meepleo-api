import { Command } from '@nestjs/cqrs'
import { IsIn, IsISO6391, IsOptional, IsUUID } from 'class-validator'
import type { GameAggregationOperation } from '@/shared/errors'
import type { GameSheetAggregationJob } from '@/shared/types'

/**
 * Runs an aggregation reserved by RequestGameSheetCommand (generation or
 * translation), saves the sheet, closes the run and publishes
 * GameSheetAggregatedEvent or GameSheetAggregationFailedEvent. Long (AI calls):
 * started in the background by GameSheetSagas, outside any transaction.
 */
export class AggregateGameSheetCommand extends Command<void> {
  @IsUUID()
  readonly runId: string

  @IsUUID()
  readonly gameId: string

  @IsISO6391()
  readonly language: string

  @IsIn(['generation', 'translation'])
  readonly operation: GameAggregationOperation

  @IsOptional()
  @IsISO6391()
  readonly sourceLanguage: string | null

  constructor({
    runId,
    gameId,
    language,
    operation,
    sourceLanguage,
  }: GameSheetAggregationJob) {
    super()
    this.runId = runId
    this.gameId = gameId
    this.language = language
    this.operation = operation
    this.sourceLanguage = sourceLanguage
  }
}
