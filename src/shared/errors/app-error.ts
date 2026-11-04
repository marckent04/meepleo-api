import { ErrorCode } from './error-codes'

/** Champ invalide, indépendant de la bibliothèque qui a validé. */
export type ErrorField = {
  field: string
  /** Clé de traduction dans validation.json (ex. `isEmail`, `zod.too_small`). */
  constraint: string
}

export type AppErrorOptions = {
  code?: ErrorCode
  /** Contexte technique : loggé (après redaction), jamais renvoyé au client. */
  details?: Record<string, unknown>
  /** Paramètres d'interpolation du message traduit. */
  params?: Record<string, unknown>
  fields?: ErrorField[]
  /** Extensions publiques renvoyées au client. */
  extensions?: Record<string, unknown>
  cause?: unknown
}

/**
 * Erreur applicative. Le message (premier argument) n'est que loggé : le
 * client reçoit le message traduit associé à `code`.
 */
export abstract class AppError extends Error {
  abstract readonly statusCode: number
  readonly code: ErrorCode
  readonly details?: Record<string, unknown>
  readonly params?: Record<string, unknown>
  readonly fields?: ErrorField[]
  private readonly publicExtensions: Record<string, unknown>

  protected constructor(
    message: string,
    defaultCode: ErrorCode,
    options: AppErrorOptions = {},
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    )
    this.name = new.target.name
    this.code = options.code ?? defaultCode
    this.details = options.details
    this.params = options.params
    this.fields = options.fields
    this.publicExtensions = options.extensions ?? {}
  }

  get extensions(): Record<string, unknown> {
    return { ...this.publicExtensions, code: this.code }
  }

  /** Erreur client attendue (4xx) : loggée en warn, sans stack. */
  get expected(): boolean {
    return this.statusCode < 500
  }
}

export class BadRequestError extends AppError {
  readonly statusCode = 400

  constructor(message = 'Bad request', options?: AppErrorOptions) {
    super(message, ErrorCode.BAD_REQUEST, options)
  }
}

export class UnauthenticatedError extends AppError {
  readonly statusCode = 401

  constructor(message = 'Unauthenticated', options?: AppErrorOptions) {
    super(message, ErrorCode.UNAUTHENTICATED, options)
  }
}

export class ForbiddenError extends AppError {
  readonly statusCode = 403

  constructor(message = 'Forbidden', options?: AppErrorOptions) {
    super(message, ErrorCode.FORBIDDEN, options)
  }
}

export class NotFoundError extends AppError {
  readonly statusCode = 404

  constructor(message = 'Not found', options?: AppErrorOptions) {
    super(message, ErrorCode.NOT_FOUND, options)
  }
}

export class ConflictError extends AppError {
  readonly statusCode = 409

  constructor(message = 'Conflict', options?: AppErrorOptions) {
    super(message, ErrorCode.CONFLICT, options)
  }
}

export class BusinessRuleError extends AppError {
  readonly statusCode = 422

  constructor(
    code: ErrorCode,
    message: string,
    options?: Omit<AppErrorOptions, 'code'>,
  ) {
    super(message, code, options)
  }
}

export class TooManyRequestsError extends AppError {
  readonly statusCode = 429

  constructor(message = 'Too many requests', options?: AppErrorOptions) {
    super(message, ErrorCode.TOO_MANY_REQUESTS, options)
  }
}

export class InternalError extends AppError {
  readonly statusCode = 500

  constructor(message = 'Internal server error', options?: AppErrorOptions) {
    super(message, ErrorCode.INTERNAL_SERVER_ERROR, options)
  }
}
