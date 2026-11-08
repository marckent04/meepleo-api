import { z } from 'zod'

/**
 * Validates process.env with a Zod schema. z.object() ignores unknown
 * variables; all errors are reported at once.
 */
export function parseEnv<TSchema extends z.ZodType>(
  schema: TSchema,
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): z.output<TSchema> {
  const result = schema.safeParse(env)
  if (!result.success) {
    throw new Error(
      `❌ ${name} environment validation error:\n${z.prettifyError(result.error)}`,
    )
  }
  return result.data
}
