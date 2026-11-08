import { registerAs } from '@nestjs/config'
import { z } from 'zod'
import { parseEnv } from './parse-env'

export const ANTHROPIC_CONFIG_KEY = 'anthropic'

/** Effort (reasoning) levels accepted for sheet generation. */
export const SHEET_EFFORTS = ['low', 'medium', 'high'] as const
export type SheetEffort = (typeof SHEET_EFFORTS)[number]

const AnthropicEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_SHEET_MODEL: z.string().min(1).default('claude-haiku-5-5'),
  ANTHROPIC_SHEET_TRANSLATION_MODEL: z
    .string()
    .min(1)
    .default('claude-haiku-5-5'),
  ANTHROPIC_SHEET_EFFORT: z.enum(SHEET_EFFORTS).default('medium'),
})

export type AnthropicConfig = {
  apiKey: string
  /** Model that generates the rule sheets. */
  sheetModel: string
  /**
   * Effort of the model that generates the sheets: less effort, fewer reasoning
   * tokens and faster generation. To compare via the runs.
   */
  sheetEffort: SheetEffort
  /** Model that translates an existing sheet into another language. */
  sheetTranslationModel: string
}

export const ANTHROPIC_CONFIG = registerAs(
  ANTHROPIC_CONFIG_KEY,
  (): AnthropicConfig => {
    const env = parseEnv(AnthropicEnvSchema, 'ANTHROPIC')
    return {
      apiKey: env.ANTHROPIC_API_KEY,
      sheetModel: env.ANTHROPIC_SHEET_MODEL,
      sheetEffort: env.ANTHROPIC_SHEET_EFFORT,
      sheetTranslationModel: env.ANTHROPIC_SHEET_TRANSLATION_MODEL,
    }
  },
)
