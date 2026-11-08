import { z } from 'zod'
import { GAME_CATEGORIES } from '@/shared/types'

/**
 * Structured output of a barcode lookup. Sent as JSON Schema
 * via `output_config.format`.
 */
export const GameBarcodeOutputSchema = z.object({
  games: z
    .array(
      z.object({
        bgg_id: z
          .number()
          .int()
          .positive()
          .describe('BoardGameGeek id of the game'),
        name: z.string().describe('Primary BoardGameGeek name'),
        localized_name: z
          .string()
          .nullable()
          .describe(
            'Title published in the target language; null if not confirmed',
          ),
        year: z
          .number()
          .int()
          .nullable()
          .describe('BoardGameGeek publication year'),
        categories: z.array(z.enum(GAME_CATEGORIES)),
      }),
    )
    .describe(
      'Every game sold under the barcode; empty if it could not be identified with certainty',
    ),
})

export type GameBarcodeOutput = z.infer<typeof GameBarcodeOutputSchema>
