import { registerAs } from '@nestjs/config'
import { z } from 'zod'
import { parseEnv } from './parse-env'

export const ANTHROPIC_CONFIG_KEY = 'anthropic'

/** Effort (reasoning) levels accepted for the AI calls. */
export const AI_EFFORTS = ['low', 'medium', 'high'] as const
export type AiEffort = (typeof AI_EFFORTS)[number]

const AnthropicEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_SHEET_MODEL: z.string().min(1).default('claude-haiku-5-5'),
  ANTHROPIC_SHEET_TRANSLATION_MODEL: z
    .string()
    .min(1)
    .default('claude-haiku-5-5'),
  ANTHROPIC_SHEET_EFFORT: z.enum(AI_EFFORTS).default('medium'),
  ANTHROPIC_BARCODE_MODEL: z.string().min(1).default('claude-haiku-5-5'),
  ANTHROPIC_BARCODE_EFFORT: z.enum(AI_EFFORTS).default('low'),
})

export type AnthropicConfig = {
  apiKey: string
  /** Model that generates the rule sheets. */
  sheetModel: string
  /**
   * Effort of the model that generates the sheets: less effort, fewer reasoning
   * tokens and faster generation. To compare via the runs.
   */
  sheetEffort: AiEffort
  /** Model that translates an existing sheet into another language. */
  sheetTranslationModel: string
  /** Model that identifies the games sold under a barcode. */
  barcodeModel: string
  /** Effort of the barcode model: a simple lookup, low is usually enough. */
  barcodeEffort: AiEffort
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
      barcodeModel: env.ANTHROPIC_BARCODE_MODEL,
      barcodeEffort: env.ANTHROPIC_BARCODE_EFFORT,
    }
  },
)
