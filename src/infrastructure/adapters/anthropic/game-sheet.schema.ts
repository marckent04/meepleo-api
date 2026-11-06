import { z } from 'zod'

/**
 * Sortie structurée demandée au modèle (snake_case, forme de src/dnup.json).
 * Envoyée comme JSON Schema via `output_config.format` : pas de schéma
 * récursif, et les contraintes numériques ne sont vérifiées que côté client.
 * Pas de champ nullable : `''` et `0` signifient « inconnu ».
 */
const UnknownText = z.string().describe('Empty string when unknown')
const UnknownInt = z.number().int().describe('0 when unknown')

const EntrySchema = z.object({
  player_counts: z
    .array(z.number().int())
    .describe(
      'Player counts this entry applies to; empty when it applies to every player count',
    ),
  text: z.string(),
})

const OrderedEntrySchema = EntrySchema.extend({ order: z.number().int() })

export const GameSheetOutputSchema = z.object({
  game: z.object({
    localized_name: z.string(),
    edition: UnknownText,
    publisher: UnknownText,
    rule_book_url: UnknownText,
  }),
  players: z.object({
    min: UnknownInt,
    max: UnknownInt,
    recommended: z.array(z.number().int()),
  }),
  min_age: UnknownInt,
  duration_minutes: z.object({
    min: UnknownInt,
    max: UnknownInt,
  }),
  description: z.string(),
  setup: z.array(OrderedEntrySchema),
  turn: z.object({
    summary: z.string(),
    steps: z.array(
      OrderedEntrySchema.extend({ optional: z.boolean(), title: z.string() }),
    ),
  }),
  // Une seule liste pour les deux : un second tableau d'objets ferait dépasser
  // la taille maximale de grammaire acceptée par l'API.
  special_rules: z.array(
    EntrySchema.extend({
      kind: z.enum(['special', 'variant']),
      title: z.string(),
    }),
  ),
  end_of_game: z.object({
    triggers: z.array(EntrySchema),
    timing: z.string(),
    scoring: z.array(OrderedEntrySchema.extend({ title: z.string() })),
    winner: z.array(EntrySchema),
  }),
  confidence: z.enum(['low', 'medium', 'high']),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
  warnings: z.array(z.string()),
})

export type GameSheetOutput = z.infer<typeof GameSheetOutputSchema>
