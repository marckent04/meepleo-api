import { HttpException } from '@nestjs/common'
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  TooManyRequestsError,
  UnauthenticatedError,
} from '@/shared/errors'

/** Statut porté par une erreur Fastify (JSON invalide, corps trop gros…). */
function frameworkStatus(exception: unknown): number | undefined {
  if (exception instanceof HttpException) return exception.getStatus()
  if (
    exception instanceof Error &&
    'statusCode' in exception &&
    typeof exception.statusCode === 'number'
  ) {
    return exception.statusCode
  }
  return undefined
}

function fromStatus(status: number, exception: Error): AppError {
  const options = { cause: exception }
  switch (status) {
    case 401:
      return new UnauthenticatedError(exception.message, options)
    case 403:
      return new ForbiddenError(exception.message, options)
    case 404:
      return new NotFoundError(exception.message, options)
    case 409:
      return new ConflictError(exception.message, options)
    case 429:
      return new TooManyRequestsError(exception.message, options)
    default:
      return status < 500
        ? new BadRequestError(exception.message, options)
        : new InternalError(exception.message, options)
  }
}

/**
 * Normalise toute exception en AppError : AppError tel quel, exception HTTP
 * (Nest ou Fastify) mappée par statut, tout le reste → InternalError.
 */
export function toAppError(exception: unknown): AppError {
  if (exception instanceof AppError) return exception
  const status = frameworkStatus(exception)
  if (status !== undefined && exception instanceof Error) {
    return fromStatus(status, exception)
  }
  return new InternalError(
    exception instanceof Error ? exception.message : 'Unknown error',
    { cause: exception },
  )
}
