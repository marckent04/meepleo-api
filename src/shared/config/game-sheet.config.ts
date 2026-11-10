import { registerAs } from '@nestjs/config'
import { z } from 'zod'
import { parseEnv } from './parse-env'

export const GAME_SHEET_CONFIG_KEY = 'gameSheet'

const GameSheetEnvSchema = z.object({
  GAME_SHEET_FAILURE_COOLDOWN_SECONDS: z.coerce.number().int().nonnegative(),
})

export type GameSheetConfig = {
  /**
   * Delay after a failed sheet aggregation during which the failure is
   * returned instead of restarting the AI (seconds).
   */
  failureCooldownSeconds: number
}

export const GAME_SHEET_CONFIG = registerAs(
  GAME_SHEET_CONFIG_KEY,
  (): GameSheetConfig => {
    const env = parseEnv(GameSheetEnvSchema, 'GAME_SHEET')
    return {
      failureCooldownSeconds: env.GAME_SHEET_FAILURE_COOLDOWN_SECONDS,
    }
  },
)
