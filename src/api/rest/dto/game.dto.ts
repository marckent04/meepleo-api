import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { GAME_BARCODE_PATTERN } from '@/domain/game/commands/find-games-by-barcode.command'
import {
  SEARCH_GAMES_MAX_LENGTH,
  SEARCH_GAMES_MAX_LIMIT,
  SEARCH_GAMES_MIN_LENGTH,
} from '@/domain/game/queries/search-games.query'
import {
  GAME_CATEGORIES,
  type GameSearchResult,
  type GameSheet,
} from '@/shared/types'

export const GameIdParamSchema = z.object({
  id: z
    .uuid()
    .describe('Game identifier')
    .meta({ example: '0195d1a2-0000-7000-8000-000000000001' }),
})

export class GameIdParamDto extends createZodDto(GameIdParamSchema) {}

export const GameBarcodeParamSchema = z.object({
  code: z
    .string()
    .regex(GAME_BARCODE_PATTERN)
    .describe(
      'Barcode printed on the game box (EAN-8, UPC-A, EAN-13): 8 to 14 digits',
    )
    .meta({ example: '3421272109111' }),
})

export class GameBarcodeParamDto extends createZodDto(GameBarcodeParamSchema) {}

export const SearchGamesQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .min(SEARCH_GAMES_MIN_LENGTH)
    .max(SEARCH_GAMES_MAX_LENGTH)
    .describe('Text contained in the game name (case and accents ignored)')
    .meta({ example: 'catan' }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(SEARCH_GAMES_MAX_LIMIT)
    .default(10)
    .describe('Maximum number of results'),
})

export class SearchGamesQueryDto extends createZodDto(SearchGamesQuerySchema) {}

export const GameSearchResultSchema = z.object({
  id: z.uuid().describe('Game identifier'),
  name: z
    .string()
    .describe(
      'Name in the Accept-Language language if the sheet was generated in it, otherwise canonical name',
    )
    .meta({ example: 'Catan' }),
  year: z.number().int().nullable().describe('Publication year'),
  categories: z.array(z.enum(GAME_CATEGORIES)).describe('Game categories'),
})

export const GameSearchResponseSchema = z
  .array(GameSearchResultSchema)
  .describe('Games matching the search, most relevant first')

export class GameSearchResponseDto extends createZodDto(
  GameSearchResponseSchema,
) {
  static fromDomain(results: GameSearchResult[]): GameSearchResponseDto {
    return results.map((result) => ({
      ...result,
      categories: [...result.categories],
    }))
  }
}

const PlayerCountsSchema = z
  .array(z.number().int().positive())
  .nullable()
  .describe(
    'Player counts concerned; null if the entry applies to all configurations',
  )
  .meta({ example: [2, 3] })

const EntrySchema = z.object({
  id: z.uuid().describe('Entry identifier'),
  playerCounts: PlayerCountsSchema,
  text: z.string().describe('Entry text'),
})

const OrderedEntrySchema = EntrySchema.extend({
  order: z
    .number()
    .int()
    .describe('Order; alternatives depending on the player count may share it'),
})

const TitleSchema = z.string().describe('Entry title')

export const GameResponseSchema = z
  .object({
    gameId: z.uuid().describe('Game identifier'),
    language: z
      .string()
      .describe('Sheet language (ISO 639-1)')
      .meta({ example: 'fr' }),
    game: z
      .object({
        localizedName: z
          .string()
          .describe('Game name in the sheet language')
          .meta({ example: 'Dnup' }),
        alternativeNames: z
          .array(z.string())
          .describe(
            'Other titles the game is published under (localized editions, BoardGameGeek alternate names), in any language',
          )
          .meta({ example: ['Pund'] }),
        edition: z.string().nullable().describe('Edition'),
        publisher: z.string().nullable().describe('Publisher'),
        ruleBookUrl: z
          .string()
          .nullable()
          .describe('URL of the official rulebook used'),
      })
      .describe('Game identification'),
    players: z
      .object({
        min: z.number().int().nullable().describe('Minimum number of players'),
        max: z.number().int().nullable().describe('Maximum number of players'),
      })
      .describe('Number of players'),
    minAge: z.number().int().nullable().describe('Minimum age'),
    durationMinutes: z
      .object({
        min: z
          .number()
          .int()
          .nullable()
          .describe('Minimum duration, in minutes'),
        max: z
          .number()
          .int()
          .nullable()
          .describe('Maximum duration, in minutes'),
      })
      .describe('Duration of a game'),
    description: z.string().describe('Game presentation'),
    setup: z.array(OrderedEntrySchema).describe('Setup steps'),
    turn: z
      .object({
        summary: z.string().describe('Turn summary'),
        steps: z
          .array(
            OrderedEntrySchema.extend({
              optional: z
                .boolean()
                .describe('Action chosen by the player rather than systematic'),
              title: TitleSchema,
            }),
          )
          .describe('Turn steps'),
      })
      .describe('Turn flow'),
    specialRules: z
      .array(EntrySchema.extend({ title: TitleSchema }))
      .describe('Special rules and exceptions'),
    variants: z
      .array(EntrySchema.extend({ title: TitleSchema }))
      .describe('Variants and optional rules'),
    endOfGame: z
      .object({
        triggers: z.array(EntrySchema).describe('End-of-game triggers'),
        timing: z.string().describe('Exact moment when the game stops'),
        scoring: z
          .array(OrderedEntrySchema.extend({ title: TitleSchema }))
          .describe('Score counting'),
        winner: z.array(EntrySchema).describe('Victory conditions'),
      })
      .describe('End of game'),
    confidence: z
      .enum(['low', 'medium', 'high'])
      .describe('Reliability of the sources used'),
    sources: z
      .array(
        z.object({
          title: z.string().describe('Source title'),
          url: z.string().describe('Source URL'),
        }),
      )
      .describe('Sources read to write the sheet'),
    warnings: z
      .array(z.string())
      .describe('Warnings (missing information, translation…)'),
    generatedBy: z
      .string()
      .describe('AI model that generated the sheet')
      .meta({ example: 'claude-haiku-5-5' }),
    generatedAt: z.iso
      .datetime()
      .describe('Sheet generation date (ISO 8601, UTC)')
      .meta({ example: '2026-01-01T12:00:00.000Z' }),
  })
  .describe('Game and its rule sheet in a language')

export class GameResponseDto extends createZodDto(GameResponseSchema, {
  codec: true,
}) {
  static fromDomain(sheet: GameSheet): GameResponseDto {
    return {
      gameId: sheet.gameId,
      language: sheet.language,
      game: { ...sheet.game },
      players: { ...sheet.players },
      minAge: sheet.minAge,
      durationMinutes: { ...sheet.durationMinutes },
      description: sheet.description,
      setup: sheet.setup,
      turn: sheet.turn,
      specialRules: sheet.specialRules,
      variants: sheet.variants,
      endOfGame: sheet.endOfGame,
      confidence: sheet.confidence,
      sources: sheet.sources,
      warnings: sheet.warnings,
      generatedBy: sheet.generatedBy,
      generatedAt: sheet.generatedAt.toISOString(),
    }
  }
}

export const GamePendingResponseSchema = z
  .object({
    status: z
      .literal('pending')
      .describe('The sheet is being generated or translated'),
    retryAfterSeconds: z
      .number()
      .int()
      .positive()
      .describe(
        'Recommended delay before calling the route again (also in Retry-After)',
      )
      .meta({ example: 5 }),
  })
  .describe(
    'Sheet not yet available in the Accept-Language language: call the same route again',
  )

export class GamePendingResponseDto extends createZodDto(
  GamePendingResponseSchema,
) {
  static create(retryAfterSeconds: number): GamePendingResponseDto {
    return { status: 'pending', retryAfterSeconds }
  }
}

/** Response of GET /games/:id: 200 with the sheet, or 202 while it is in progress. */
export const GameLookupResponseSchema = z.union([
  GameResponseSchema,
  GamePendingResponseSchema,
])
