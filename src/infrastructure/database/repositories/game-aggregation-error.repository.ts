import { Injectable } from '@nestjs/common'
import { TransactionHost } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import { redactSecrets } from '@/infrastructure/logger/redact.util'
import {
  AppError,
  ErrorCode,
  GameAggregationFailedError,
  type GameAggregationOperation,
} from '@/shared/errors'
import {
  GameAggregationOperation as GameAggregationOperationRecord,
  type Prisma,
} from '../generated/prisma/client'
import type { PrismaService } from '../prisma.service'
import { rethrowPrismaError } from '../prisma-errors'

export type RecordGameAggregationErrorParams = {
  gameId: string
  language: string
  error: unknown
}

const OPERATION_TO_RECORD: Record<
  GameAggregationOperation,
  GameAggregationOperationRecord
> = {
  generation: GameAggregationOperationRecord.GENERATION,
  translation: GameAggregationOperationRecord.TRANSLATION,
}

@Injectable()
export class GameAggregationErrorRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {}

  /**
   * Trace l'échec d'une agrégation de fiche. L'opération, le modèle et la
   * langue source ne sont connus que pour une GameAggregationFailedError.
   */
  async record({
    gameId,
    language,
    error,
  }: RecordGameAggregationErrorParams): Promise<void> {
    const aggregation =
      error instanceof GameAggregationFailedError ? error : undefined
    const cause = aggregation?.cause ?? error
    const details =
      error instanceof AppError && error.details
        ? (redactSecrets(error.details) as Prisma.InputJsonValue)
        : undefined

    try {
      await this.txHost.tx.gameAggregationError.create({
        data: {
          gameId,
          language,
          operation: aggregation
            ? OPERATION_TO_RECORD[aggregation.operation]
            : null,
          sourceLanguage: aggregation?.sourceLanguage ?? null,
          model: aggregation?.model ?? null,
          code:
            error instanceof AppError
              ? error.code
              : ErrorCode.INTERNAL_SERVER_ERROR,
          message: cause instanceof Error ? cause.message : String(cause),
          details,
        },
      })
    } catch (writeError) {
      rethrowPrismaError(writeError)
    }
  }
}
