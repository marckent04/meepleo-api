import { registerAs } from '@nestjs/config'
import { z } from 'zod'
import { parseEnv } from '../../shared/config/parse-env'

export const DATABASE_CONFIG_KEY = 'database'

const DatabaseEnvSchema = z.object({
  DATABASE_URL: z.url({
    protocol: /^postgres(ql)?$/,
    error: 'DATABASE_URL must be a postgres:// or postgresql:// URL',
  }),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
})

export type DatabaseEnv = z.output<typeof DatabaseEnvSchema>

export type DatabaseConfig = {
  url: string
  poolMax: number
}

/** Partagé avec prisma.config.ts : une seule validation pour l'app et la CLI. */
export function loadDatabaseEnv(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseEnv {
  return parseEnv(DatabaseEnvSchema, 'DATABASE', env)
}

export const DATABASE_CONFIG = registerAs(
  DATABASE_CONFIG_KEY,
  (): DatabaseConfig => {
    const env = loadDatabaseEnv()
    return { url: env.DATABASE_URL, poolMax: env.DB_POOL_MAX }
  },
)
