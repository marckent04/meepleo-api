import { ErrorCode } from './error-codes'

/** Invalid field, independent of the library that validated it. */
export type ErrorField = {
  field: string
  /** Translation key in validation.json (e.g. `isEmail`, `zod.too_small`). */
  constraint: string
}

export type AppErrorOptions = {
  code?: ErrorCode
  /** Technical context: logged (after redaction), never returned to the client. */
  details?: Record<string, unknown>
  /** Interpolation parameters of the translated message. */
  params?: Record<string, unknown>
  fields?: ErrorField[]
  /** Public extensions returned to the client. */
  extensions?: Record<string, unknown>
  cause?: unknown
}

/**
 * Application error. The message (first argument) is only logged: the
 * client receives the translated message associated with `code`.
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

  /** Expected client error (4xx): logged as warn, without a stack. */
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

export class PayloadTooLargeError extends AppError {
  readonly statusCode = 413

  constructor(message = 'Payload too large', options?: AppErrorOptions) {
    super(message, ErrorCode.PAYLOAD_TOO_LARGE, options)
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
