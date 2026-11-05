import { z } from 'zod'

/**
 * Sortie structurée demandée au modèle (snake_case, forme de src/dnup.json).
 * Envoyée comme JSON Schema via `output_config.format` : pas de schéma
 * récursif, et les contraintes numériques ne sont vérifiées que côté client.
 */
const PlayerCountsSchema = z
  .array(z.number().int())
  .nullable()
  .describe(
    'Player counts this entry applies to; null when it applies to every player count',
  )

const EntrySchema = z.object({
  id: z.string(),
  player_counts: PlayerCountsSchema,
  text: z.string(),
})

const OrderedEntrySchema = EntrySchema.extend({ order: z.number().int() })

export const GameSheetOutputSchema = z.object({
  game: z.object({
    localized_name: z.string(),
    edition: z.string().nullable(),
    publisher: z.string().nullable(),
    rule_book_url: z.string().nullable(),
  }),
  players: z.object({
    min: z.number().int().nullable(),
    max: z.number().int().nullable(),
    recommended: z.array(z.number().int()),
  }),
  min_age: z.number().int().nullable(),
  duration_minutes: z.object({
    min: z.number().int().nullable(),
    max: z.number().int().nullable(),
  }),
  description: z.string(),
  setup: z.array(OrderedEntrySchema),
  turn: z.object({
    summary: z.string(),
    steps: z.array(
      OrderedEntrySchema.extend({ optional: z.boolean(), title: z.string() }),
    ),
  }),
  special_rules: z.array(EntrySchema.extend({ title: z.string() })),
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
