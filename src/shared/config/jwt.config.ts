import { registerAs } from '@nestjs/config'
import { z } from 'zod'
import { parseEnv } from './parse-env'

export const JWT_CONFIG_KEY = 'jwt'

/** Durée : nombre de secondes ou suffixe s/m/h/d (ex. `15m`, `30d`). */
const DurationSchema = z.string().regex(/^\d+[smhd]?$/)

const JwtEnvSchema = z
  .object({
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_TTL: DurationSchema.default('15m'),
    JWT_REFRESH_TTL: DurationSchema.default('30d'),
  })
  .refine((env) => env.JWT_ACCESS_SECRET !== env.JWT_REFRESH_SECRET, {
    message: 'JWT_ACCESS_SECRET et JWT_REFRESH_SECRET doivent être distincts',
    path: ['JWT_REFRESH_SECRET'],
  })

export type JwtConfig = {
  accessSecret: string
  refreshSecret: string
  /** Durée de vie de l'access token (ex. `15m`). */
  accessTtl: string
  /** Durée de vie du refresh token (ex. `30d`). */
  refreshTtl: string
}

export const JWT_CONFIG = registerAs(JWT_CONFIG_KEY, (): JwtConfig => {
  const env = parseEnv(JwtEnvSchema, 'JWT')
  return {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessTtl: env.JWT_ACCESS_TTL,
    refreshTtl: env.JWT_REFRESH_TTL,
  }
})
