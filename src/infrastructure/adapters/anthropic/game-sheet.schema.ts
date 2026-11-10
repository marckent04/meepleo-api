import { z } from 'zod'

/**
 * Structured output requested from the model (snake_case, shape of src/dnup.json).
 * Sent as JSON Schema via `output_config.format`: no recursive schema,
 * and numeric constraints are only checked client-side.
 * No nullable field: `''` and `0` mean "unknown".
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
    // A single string, not an array: one more array would exceed the
    // maximum grammar size accepted by the API (see special_rules).
    alternative_names: z
      .string()
      .describe(
        'Other titles the game is published under (localized editions, BoardGameGeek alternate names), catalog name excluded; one title per line, empty string when none',
      ),
    localized_names: z
      .string()
      .describe(
        'Confirmed title in each title language, one "<language code>: <title>" line per language; empty string when none',
      ),
    edition: UnknownText,
    publisher: UnknownText,
    rule_book_url: UnknownText,
  }),
  players: z.object({
    min: UnknownInt,
    max: UnknownInt,
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
  // A single list for both: a second array of objects would exceed
  // the maximum grammar size accepted by the API.
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
