import type { z } from 'zod'
import type { ErrorField } from '@/shared/errors'

/** Same format as toErrorFields (class-validator): `zod.<issue code>`. */
export function toZodErrorFields(error: z.core.$ZodError): ErrorField[] {
  return error.issues.map((issue) => ({
    field: issue.path.map(String).join('.'),
    constraint: `zod.${issue.code}`,
  }))
}
