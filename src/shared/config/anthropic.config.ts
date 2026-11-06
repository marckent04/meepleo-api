import { registerAs } from '@nestjs/config'
import { z } from 'zod'
import { parseEnv } from './parse-env'

export const ANTHROPIC_CONFIG_KEY = 'anthropic'

/** Niveaux d'effort (raisonnement) acceptés pour la génération des fiches. */
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
  /** Modèle qui génère les fiches de règles. */
  sheetModel: string
  /**
   * Effort du modèle qui génère les fiches : moins d'effort, moins de tokens
   * de raisonnement et une génération plus rapide. À comparer via les runs.
   */
  sheetEffort: SheetEffort
  /** Modèle qui traduit une fiche existante dans une autre langue. */
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
