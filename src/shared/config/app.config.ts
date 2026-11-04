import { registerAs } from '@nestjs/config'
import { z } from 'zod'
import { parseEnv } from './parse-env'

export const APP_CONFIG_KEY = 'app'

export const NODE_ENVS = ['development', 'test', 'production'] as const
export type NodeEnv = (typeof NODE_ENVS)[number]

const AppEnvSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // Défini par yarn/npm lors d'un `yarn start` ; absent avec `node dist/main`.
  npm_package_version: z.string().default('0.0.0'),
})

export type AppConfig = {
  nodeEnv: NodeEnv
  port: number
  version: string
}

export const APP_CONFIG = registerAs(APP_CONFIG_KEY, (): AppConfig => {
  const env = parseEnv(AppEnvSchema, 'APP')
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    version: env.npm_package_version,
  }
})
