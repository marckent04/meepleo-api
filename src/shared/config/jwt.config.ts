import { registerAs } from '@nestjs/config'
import { z } from 'zod'
import { parseEnv } from './parse-env'

export const JWT_CONFIG_KEY = 'jwt'

/** Duration: number of seconds or s/m/h/d suffix (e.g. `15m`, `30d`). */
const DurationSchema = z.string().regex(/^\d+[smhd]?$/)

const JwtEnvSchema = z
  .object({
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_TTL: DurationSchema.default('15m'),
    JWT_REFRESH_TTL: DurationSchema.default('30d'),
  })
  .refine((env) => env.JWT_ACCESS_SECRET !== env.JWT_REFRESH_SECRET, {
    message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be distinct',
    path: ['JWT_REFRESH_SECRET'],
  })

export type JwtConfig = {
  accessSecret: string
  refreshSecret: string
  /** Access token lifetime (e.g. `15m`). */
  accessTtl: string
  /** Refresh token lifetime (e.g. `30d`). */
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
