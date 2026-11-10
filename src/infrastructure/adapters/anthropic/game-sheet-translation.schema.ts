import { z } from 'zod'

/**
 * Structured output of a sheet translation. Sent as JSON Schema
 * via `output_config.format`.
 */
export const GameSheetTranslationOutputSchema = z.object({
  description: z.string(),
  turn_summary: z.string(),
  end_timing: z.string(),
  warnings: z
    .array(z.string())
    .describe('Same count and order as the source warnings'),
  rules: z
    .array(
      z.object({
        id: z.string().describe('Id of the source rule, unchanged'),
        title: z
          .string()
          .nullable()
          .describe('null when the source rule has no title'),
        text: z.string(),
      }),
    )
    .describe('Every source rule exactly once'),
})

export type GameSheetTranslationOutput = z.infer<
  typeof GameSheetTranslationOutputSchema
>
