import type { AppError } from '@/shared/errors'
import type { ErrorTranslator } from '../../common/errors/error-translator'
import type { ErrorResponse } from './error-response.dto'

export function formatRestError(
  error: AppError,
  translator: ErrorTranslator,
  correlationId: string,
): ErrorResponse {
  return {
    code: error.code,
    message: translator.error(error),
    ...(error.fields?.length
      ? {
          fields: error.fields.map(({ field, constraint }) => ({
            field,
            message: translator.constraint(constraint),
          })),
        }
      : {}),
    correlationId,
  }
}
