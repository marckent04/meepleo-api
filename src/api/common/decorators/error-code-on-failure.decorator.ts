import { SetMetadata } from '@nestjs/common'
import type { ErrorCode } from '@/shared/errors'

export const ERROR_CODE_ON_FAILURE = 'errorCodeOnFailure'

/**
 * Code returned instead of the generic INTERNAL_SERVER_ERROR when the route
 * fails unexpectedly. Client errors keep their own code.
 */
export const ErrorCodeOnFailure = (code: ErrorCode) =>
  SetMetadata(ERROR_CODE_ON_FAILURE, code)
