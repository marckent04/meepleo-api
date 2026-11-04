import { SetMetadata } from '@nestjs/common'
import type { ErrorCode } from '@/shared/errors'

export const ERROR_CODE_ON_FAILURE = 'errorCodeOnFailure'

/**
 * Code renvoyé à la place du INTERNAL_SERVER_ERROR générique si la route
 * échoue de façon inattendue. Les erreurs client gardent leur code.
 */
export const ErrorCodeOnFailure = (code: ErrorCode) =>
  SetMetadata(ERROR_CODE_ON_FAILURE, code)
