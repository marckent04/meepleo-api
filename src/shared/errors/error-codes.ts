/**
 * Contractual inventory of the error codes exposed to clients.
 * Codes are only ever added; never renamed or removed.
 * Each code must be translated in src/i18n/<lang>/errors.json.
 */
export enum ErrorCode {
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  UNPROCESSABLE_ENTITY = 'UNPROCESSABLE_ENTITY',
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  HEALTH_CHECK_FAILED = 'HEALTH_CHECK_FAILED',
  GAME_NOT_FOUND = 'GAME_NOT_FOUND',
  GAME_SHEET_GENERATION_FAILED = 'GAME_SHEET_GENERATION_FAILED',
  GAME_SHEET_TRANSLATION_FAILED = 'GAME_SHEET_TRANSLATION_FAILED',
  GAME_BARCODE_LOOKUP_FAILED = 'GAME_BARCODE_LOOKUP_FAILED',
  LANGUAGE_REQUIRED = 'LANGUAGE_REQUIRED',
  UNSUPPORTED_LANGUAGE = 'UNSUPPORTED_LANGUAGE',
  EMAIL_ALREADY_USED = 'EMAIL_ALREADY_USED',
  USERNAME_ALREADY_USED = 'USERNAME_ALREADY_USED',
  DISPOSABLE_EMAIL_NOT_ALLOWED = 'DISPOSABLE_EMAIL_NOT_ALLOWED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  INVALID_REFRESH_TOKEN = 'INVALID_REFRESH_TOKEN',
}

export const ERROR_CODES: Record<
  ErrorCode,
  { expected: boolean; description: string }
> = {
  [ErrorCode.BAD_REQUEST]: {
    expected: true,
    description: 'Invalid request',
  },
  [ErrorCode.UNAUTHENTICATED]: {
    expected: true,
    description: 'Authentication required or invalid',
  },
  [ErrorCode.FORBIDDEN]: {
    expected: true,
    description: 'Action not allowed',
  },
  [ErrorCode.NOT_FOUND]: {
    expected: true,
    description: 'Resource not found',
  },
  [ErrorCode.CONFLICT]: {
    expected: true,
    description: 'Conflict with an existing resource',
  },
  [ErrorCode.UNPROCESSABLE_ENTITY]: {
    expected: true,
    description: 'Business rule violated',
  },
  [ErrorCode.TOO_MANY_REQUESTS]: {
    expected: true,
    description: 'Too many requests',
  },
  [ErrorCode.VALIDATION_FAILED]: {
    expected: true,
    description: 'Invalid data sent (see fields)',
  },
  [ErrorCode.INTERNAL_SERVER_ERROR]: {
    expected: false,
    description: 'Unexpected internal error',
  },
  [ErrorCode.HEALTH_CHECK_FAILED]: {
    expected: false,
    description: 'The API health check failed',
  },
  [ErrorCode.GAME_NOT_FOUND]: {
    expected: true,
    description: 'Game not found',
  },
  [ErrorCode.GAME_SHEET_GENERATION_FAILED]: {
    expected: false,
    description: 'AI generation of the rule sheet failed',
  },
  [ErrorCode.GAME_SHEET_TRANSLATION_FAILED]: {
    expected: false,
    description: 'AI translation of the rule sheet failed',
  },
  [ErrorCode.GAME_BARCODE_LOOKUP_FAILED]: {
    expected: false,
    description: 'The external barcode lookup failed',
  },
  [ErrorCode.LANGUAGE_REQUIRED]: {
    expected: true,
    description: 'The Accept-Language header is required',
  },
  [ErrorCode.UNSUPPORTED_LANGUAGE]: {
    expected: true,
    description: 'None of the Accept-Language languages is supported',
  },
  [ErrorCode.EMAIL_ALREADY_USED]: {
    expected: true,
    description: 'An account already exists with this email',
  },
  [ErrorCode.DISPOSABLE_EMAIL_NOT_ALLOWED]: {
    expected: true,
    description: 'Disposable email addresses are rejected at sign-up',
  },
  [ErrorCode.USERNAME_ALREADY_USED]: {
    expected: true,
    description: 'This username is already taken',
  },
  [ErrorCode.INVALID_CREDENTIALS]: {
    expected: true,
    description: 'Incorrect username or password',
  },
  [ErrorCode.INVALID_REFRESH_TOKEN]: {
    expected: true,
    description: 'Invalid, expired or revoked refresh token',
  },
}

export function isErrorCode(code: unknown): code is ErrorCode {
  return typeof code === 'string' && Object.hasOwn(ERROR_CODES, code)
}

/** Generic code used when an error has no specific code. */
export function genericErrorCodeForStatus(statusCode: number): ErrorCode {
  switch (statusCode) {
    case 400:
      return ErrorCode.BAD_REQUEST
    case 401:
      return ErrorCode.UNAUTHENTICATED
    case 403:
      return ErrorCode.FORBIDDEN
    case 404:
      return ErrorCode.NOT_FOUND
    case 409:
      return ErrorCode.CONFLICT
    case 422:
      return ErrorCode.UNPROCESSABLE_ENTITY
    case 429:
      return ErrorCode.TOO_MANY_REQUESTS
    default:
      return statusCode < 500
        ? ErrorCode.BAD_REQUEST
        : ErrorCode.INTERNAL_SERVER_ERROR
  }
}
