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
import type { AiTrace } from '@/shared/types'
import {
  GameAggregationOperation as GameAggregationOperationRecord,
  GameAggregationStatus,
  type Prisma,
} from '../generated/prisma/client'
import type { PrismaService } from '../prisma.service'
import { rethrowPrismaError } from '../prisma-errors'

export type RecordGameAggregationSuccessParams = {
  gameId: string
  language: string
  operation: GameAggregationOperation
  /** Langue source d'une traduction. */
  sourceLanguage?: string | null
  /** Durée totale de l'opération (appels IA + enregistrement), en ms. */
  durationMs: number
  trace: AiTrace
}

export type RecordGameAggregationFailureParams = {
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

const toJson = (value: unknown): Prisma.InputJsonValue | undefined =>
  value === null || value === undefined
    ? undefined
    : (value as Prisma.InputJsonValue)

/** Colonnes issues de la trace de l'IA : durée, consommation, sortie brute. */
function traceToColumns(trace: AiTrace) {
  return {
    model: trace.model,
    aiDurationMs: trace.durationMs,
    requestCount: trace.requestCount,
    inputTokens: trace.usage.inputTokens,
    outputTokens: trace.usage.outputTokens,
    cacheCreationInputTokens: trace.usage.cacheCreationInputTokens,
    cacheReadInputTokens: trace.usage.cacheReadInputTokens,
    webSearchRequests: trace.usage.webSearchRequests,
    webFetchRequests: trace.usage.webFetchRequests,
    stopReason: trace.stopReason,
    promptVersion: trace.promptVersion,
    settings: toJson(trace.settings),
    output: toJson(trace.output),
    rawText: trace.rawText,
  }
}

/**
 * Trace de chaque tentative d'agrégation de fiche. Le dernier run SUCCESS de
 * génération fait foi : c'est lui qui marque la fiche comme générée.
 */
@Injectable()
export class GameAggregationRunRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {}

  /** À appeler dans la transaction qui enregistre la fiche. */
  async recordSuccess({
    gameId,
    language,
    operation,
    sourceLanguage = null,
    durationMs,
    trace,
  }: RecordGameAggregationSuccessParams): Promise<void> {
    try {
      await this.txHost.tx.gameAggregationRun.create({
        data: {
          gameId,
          status: GameAggregationStatus.SUCCESS,
          language,
          operation: OPERATION_TO_RECORD[operation],
          sourceLanguage,
          durationMs: Math.round(durationMs),
          ...traceToColumns(trace),
        },
      })
    } catch (writeError) {
      rethrowPrismaError(writeError)
    }
  }

  /**
   * Trace l'échec d'une agrégation de fiche. L'opération, le modèle, la durée
   * et la trace de l'IA ne sont connus que pour une GameAggregationFailedError.
   */
  async recordFailure({
    gameId,
    language,
    error,
  }: RecordGameAggregationFailureParams): Promise<void> {
    const aggregation =
      error instanceof GameAggregationFailedError ? error : undefined
    const cause = aggregation?.cause ?? error
    const details =
      error instanceof AppError && error.details
        ? (redactSecrets(error.details) as Prisma.InputJsonValue)
        : undefined

    try {
      await this.txHost.tx.gameAggregationRun.create({
        data: {
          gameId,
          status: GameAggregationStatus.FAILURE,
          language,
          operation: aggregation
            ? OPERATION_TO_RECORD[aggregation.operation]
            : null,
          sourceLanguage: aggregation?.sourceLanguage ?? null,
          model: aggregation?.model ?? null,
          durationMs: Math.round(aggregation?.durationMs ?? 0),
          ...(aggregation?.trace ? traceToColumns(aggregation.trace) : {}),
          errorCode:
            error instanceof AppError
              ? error.code
              : ErrorCode.INTERNAL_SERVER_ERROR,
          errorMessage: cause instanceof Error ? cause.message : String(cause),
          errorDetails: details,
        },
      })
    } catch (writeError) {
      rethrowPrismaError(writeError)
    }
  }
}
