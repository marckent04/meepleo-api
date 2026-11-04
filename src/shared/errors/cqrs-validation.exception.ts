import { AppError, type ErrorField } from './app-error'
import { ErrorCode } from './error-codes'

export type OriginType = 'user' | 'system'

export type CQRSValidationExceptionParams = {
  data: unknown
  operationName: string
  originType: OriginType
  validationErrors: string[]
  fields: ErrorField[]
}

/**
 * Payload de Command/Query invalide. Origine `user` → 400 VALIDATION_FAILED
 * avec les champs ; origine `system` → 500 sans exposer les détails.
 */
export class CQRSValidationException extends AppError {
  readonly statusCode: number

  constructor({
    data,
    operationName,
    originType,
    validationErrors,
    fields,
  }: CQRSValidationExceptionParams) {
    const fromUser = originType === 'user'
    super(
      `Invalid payload for ${operationName}`,
      fromUser ? ErrorCode.VALIDATION_FAILED : ErrorCode.INTERNAL_SERVER_ERROR,
      {
        details: { operationName, originType, data, validationErrors },
        fields: fromUser ? fields : undefined,
        extensions: fromUser ? { validationErrors } : undefined,
      },
    )
    this.statusCode = fromUser ? 400 : 500
  }
}
