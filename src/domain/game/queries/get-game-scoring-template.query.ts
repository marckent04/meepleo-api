import { Query } from '@nestjs/cqrs'
import { IsISO6391, IsUUID } from 'class-validator'
import type { ScoringTemplate } from '@/shared/types'

/**
 * Score sheet template of a game, in a language. A game without a template
 * gets the default one: a single score per player, highest wins.
 */
export class GetGameScoringTemplateQuery extends Query<ScoringTemplate> {
  @IsUUID()
  readonly gameId: string

  /** ISO 639-1 code of the texts' language (e.g. `fr`). */
  @IsISO6391()
  readonly language: string

  constructor({ gameId, language }: { gameId: string; language: string }) {
    super()
    this.gameId = gameId
    this.language = language
  }
}
