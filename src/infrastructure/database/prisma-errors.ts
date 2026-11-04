import {
  BadRequestError,
  ConflictError,
  type ErrorCode,
  NotFoundError,
} from '@/shared/errors'
import { Prisma } from './generated/prisma/client'

export type PrismaErrorCodes = {
  notFound?: ErrorCode
  conflict?: ErrorCode
}

/**
 * Champs en conflit d'une erreur P2002. Avec un driver adapter, Prisma les
 * expose dans `meta.driverAdapterError.cause.constraint.fields` plutôt que
 * dans `meta.target`.
 */
function conflictTarget(meta: Record<string, unknown> | undefined): unknown {
  if (meta?.target !== undefined) return meta.target
  const adapterError = meta?.driverAdapterError as
    | { cause?: { constraint?: { fields?: unknown } } }
    | undefined
  return adapterError?.cause?.constraint?.fields
}

/**
 * Traduit les erreurs Prisma connues en AppError ; relance tout le reste tel
 * quel (le filtre d'exception en fera une InternalError).
 */
export function rethrowPrismaError(
  error: unknown,
  codes: PrismaErrorCodes = {},
): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        throw new ConflictError('Unique constraint violation', {
          code: codes.conflict,
          details: { target: conflictTarget(error.meta) },
          cause: error,
        })
      case 'P2025':
        throw new NotFoundError('Record not found', {
          code: codes.notFound,
          cause: error,
        })
      case 'P2003':
        throw new BadRequestError('Foreign key constraint violation', {
          details: { field: error.meta?.field_name },
          cause: error,
        })
    }
  }
  throw error
}
