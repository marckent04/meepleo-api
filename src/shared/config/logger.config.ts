import { registerAs } from '@nestjs/config'
import { z } from 'zod'
import { parseEnv } from './parse-env'

export const LOGGER_CONFIG_KEY = 'logger'

export const LOG_LEVELS = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

const csv = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

const LoggerEnvSchema = z.object({
  LOG_LEVELS: z
    .string()
    .default('warn,error')
    .transform(csv)
    .pipe(
      z
        .array(z.enum(LOG_LEVELS))
        .min(1)
        .refine((levels) => new Set(levels).size === levels.length, {
          message: 'LOG_LEVELS must not contain duplicates',
        }),
    ),
})

export type LoggerConfig = {
  levels: ReadonlySet<LogLevel>
}

export const LOGGER_CONFIG = registerAs(LOGGER_CONFIG_KEY, (): LoggerConfig => {
  const env = parseEnv(LoggerEnvSchema, 'LOGGER')
  return { levels: new Set(env.LOG_LEVELS) }
})
