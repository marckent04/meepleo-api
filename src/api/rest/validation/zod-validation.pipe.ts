import { createZodValidationPipe } from 'nestjs-zod'
import { z } from 'zod'
import { BadRequestError, ErrorCode } from '@/shared/errors'
import { toZodErrorFields } from './zod-error-fields'

/** A Zod error directly becomes an AppError VALIDATION_FAILED. */
export const AppZodValidationPipe = createZodValidationPipe({
  createValidationException: (error: unknown) =>
    new BadRequestError('Validation failed', {
      code: ErrorCode.VALIDATION_FAILED,
      fields: error instanceof z.core.$ZodError ? toZodErrorFields(error) : [],
      cause: error,
    }),
})
