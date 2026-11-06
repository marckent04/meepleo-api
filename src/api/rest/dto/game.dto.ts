import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
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
    .describe('Identifiant du jeu')
    .meta({ example: '0195d1a2-0000-7000-8000-000000000001' }),
})

export class GameIdParamDto extends createZodDto(GameIdParamSchema) {}

export const SearchGamesQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .min(SEARCH_GAMES_MIN_LENGTH)
    .max(SEARCH_GAMES_MAX_LENGTH)
    .describe('Texte contenu dans le nom du jeu (casse et accents ignorés)')
    .meta({ example: 'catan' }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(SEARCH_GAMES_MAX_LIMIT)
    .default(10)
    .describe('Nombre maximal de résultats'),
})

export class SearchGamesQueryDto extends createZodDto(SearchGamesQuerySchema) {}

export const GameSearchResultSchema = z.object({
  id: z.uuid().describe('Identifiant du jeu'),
  name: z
    .string()
    .describe(
      "Nom dans la langue d'Accept-Language si la fiche y a été générée, sinon nom canonique",
    )
    .meta({ example: 'Catan' }),
  year: z.number().int().nullable().describe('Année de publication'),
  categories: z.array(z.enum(GAME_CATEGORIES)).describe('Catégories du jeu'),
})

export const GameSearchResponseSchema = z
  .array(GameSearchResultSchema)
  .describe('Jeux correspondant à la recherche, les plus pertinents en premier')

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
    "Nombres de joueurs concernés ; null si l'entrée s'applique à toutes les configurations",
  )
  .meta({ example: [2, 3] })

const EntrySchema = z.object({
  id: z.uuid().describe("Identifiant de l'entrée"),
  playerCounts: PlayerCountsSchema,
  text: z.string().describe("Texte de l'entrée"),
})

const OrderedEntrySchema = EntrySchema.extend({
  order: z
    .number()
    .int()
    .describe(
      'Ordre ; des alternatives selon le nombre de joueurs peuvent le partager',
    ),
})

const TitleSchema = z.string().describe("Titre de l'entrée")

export const GameResponseSchema = z
  .object({
    gameId: z.uuid().describe('Identifiant du jeu'),
    language: z
      .string()
      .describe('Langue de la fiche (ISO 639-1)')
      .meta({ example: 'fr' }),
    game: z
      .object({
        localizedName: z
          .string()
          .describe('Nom du jeu dans la langue de la fiche')
          .meta({ example: 'Dnup' }),
        edition: z.string().nullable().describe('Édition'),
        publisher: z.string().nullable().describe('Éditeur'),
        ruleBookUrl: z
          .string()
          .nullable()
          .describe('URL de la règle officielle utilisée'),
      })
      .describe('Identification du jeu'),
    players: z
      .object({
        min: z.number().int().nullable().describe('Nombre minimal de joueurs'),
        max: z.number().int().nullable().describe('Nombre maximal de joueurs'),
        recommended: z
          .array(z.number().int())
          .describe('Nombres de joueurs recommandés'),
      })
      .describe('Nombre de joueurs'),
    minAge: z.number().int().nullable().describe('Âge minimal'),
    durationMinutes: z
      .object({
        min: z.number().int().nullable().describe('Durée minimale, en minutes'),
        max: z.number().int().nullable().describe('Durée maximale, en minutes'),
      })
      .describe("Durée d'une partie"),
    description: z.string().describe('Présentation du jeu'),
    setup: z.array(OrderedEntrySchema).describe('Étapes de mise en place'),
    turn: z
      .object({
        summary: z.string().describe("Résumé d'un tour"),
        steps: z
          .array(
            OrderedEntrySchema.extend({
              optional: z
                .boolean()
                .describe('Action au choix du joueur plutôt que systématique'),
              title: TitleSchema,
            }),
          )
          .describe("Étapes d'un tour"),
      })
      .describe("Déroulement d'un tour"),
    specialRules: z
      .array(EntrySchema.extend({ title: TitleSchema }))
      .describe('Règles spéciales et exceptions'),
    endOfGame: z
      .object({
        triggers: z
          .array(EntrySchema)
          .describe('Déclencheurs de fin de partie'),
        timing: z.string().describe("Moment exact où la partie s'arrête"),
        scoring: z
          .array(OrderedEntrySchema.extend({ title: TitleSchema }))
          .describe('Décompte des points'),
        winner: z.array(EntrySchema).describe('Conditions de victoire'),
      })
      .describe('Fin de partie'),
    confidence: z
      .enum(['low', 'medium', 'high'])
      .describe('Fiabilité des sources utilisées'),
    sources: z
      .array(
        z.object({
          title: z.string().describe('Titre de la source'),
          url: z.string().describe('URL de la source'),
        }),
      )
      .describe('Sources lues pour rédiger la fiche'),
    warnings: z
      .array(z.string())
      .describe('Avertissements (informations manquantes, traduction…)'),
    generatedBy: z
      .string()
      .describe("Modèle d'IA ayant généré la fiche")
      .meta({ example: 'claude-haiku-5-5' }),
    generatedAt: z.iso
      .datetime()
      .describe('Date de génération de la fiche (ISO 8601, UTC)')
      .meta({ example: '2026-01-01T12:00:00.000Z' }),
  })
  .describe('Jeu et sa fiche de règles dans une langue')

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
      .describe('La fiche est en cours de génération ou de traduction'),
    retryAfterSeconds: z
      .number()
      .int()
      .positive()
      .describe(
        'Délai conseillé avant de rappeler la route (aussi dans Retry-After)',
      )
      .meta({ example: 5 }),
  })
  .describe(
    "Fiche pas encore disponible dans la langue d'Accept-Language : rappeler la même route",
  )

export class GamePendingResponseDto extends createZodDto(
  GamePendingResponseSchema,
) {
  static create(retryAfterSeconds: number): GamePendingResponseDto {
    return { status: 'pending', retryAfterSeconds }
  }
}

/** Réponse de GET /games/:id : 200 avec la fiche, ou 202 tant qu'elle est en cours. */
export const GameLookupResponseSchema = z.union([
  GameResponseSchema,
  GamePendingResponseSchema,
])
