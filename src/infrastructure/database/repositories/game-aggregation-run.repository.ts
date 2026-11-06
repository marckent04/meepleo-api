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
import type {
  AiTrace,
  GameAggregationRunStatus,
  GameAggregationRunSummary,
} from '@/shared/types'
import {
  GameAggregationOperation as GameAggregationOperationRecord,
  GameAggregationStatus,
  type Prisma,
} from '../generated/prisma/client'
import type { PrismaService } from '../prisma.service'
import { rethrowPrismaError } from '../prisma-errors'

export type StartGameAggregationParams = {
  gameId: string
  language: string
  operation: GameAggregationOperation
  /** Langue source d'une traduction. */
  sourceLanguage?: string | null
  /** Modèle d'IA prévu pour l'opération. */
  model: string
}

export type RecordGameAggregationSuccessParams = {
  runId: string
  /** Durée totale de l'opération (appels IA + enregistrement), en ms. */
  durationMs: number
  trace: AiTrace
}

export type RecordGameAggregationFailureParams = {
  runId: string
  error: unknown
}

const OPERATION_TO_RECORD: Record<
  GameAggregationOperation,
  GameAggregationOperationRecord
> = {
  generation: GameAggregationOperationRecord.GENERATION,
  translation: GameAggregationOperationRecord.TRANSLATION,
}

const OPERATION_FROM_RECORD: Record<
  GameAggregationOperationRecord,
  GameAggregationOperation
> = {
  GENERATION: 'generation',
  TRANSLATION: 'translation',
}

const STATUS_FROM_RECORD: Record<
  GameAggregationStatus,
  GameAggregationRunStatus
> = {
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILURE: 'failure',
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
 * Trace de chaque tentative d'agrégation de fiche. Un run est créé RUNNING au
 * lancement, puis passé SUCCESS ou FAILURE. Le dernier run SUCCESS de
 * génération fait foi : c'est lui qui marque la fiche comme générée.
 */
@Injectable()
export class GameAggregationRunRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {}

  /** Crée le run RUNNING d'une agrégation qui démarre ; renvoie son id. */
  async start({
    gameId,
    language,
    operation,
    sourceLanguage = null,
    model,
  }: StartGameAggregationParams): Promise<string> {
    try {
      const run = await this.txHost.tx.gameAggregationRun.create({
        data: {
          gameId,
          status: GameAggregationStatus.RUNNING,
          language,
          operation: OPERATION_TO_RECORD[operation],
          sourceLanguage,
          model,
          durationMs: 0,
        },
        select: { id: true },
      })
      return run.id
    } catch (writeError) {
      rethrowPrismaError(writeError)
    }
  }

  /** Run le plus récent du jeu dans `language`, quel que soit son statut. */
  async findLatest(
    gameId: string,
    language: string,
  ): Promise<GameAggregationRunSummary | null> {
    const run = await this.txHost.tx.gameAggregationRun.findFirst({
      where: { gameId, language },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        operation: true,
        errorCode: true,
        createdAt: true,
      },
    })
    if (!run) return null
    return {
      id: run.id,
      status: STATUS_FROM_RECORD[run.status],
      operation: run.operation ? OPERATION_FROM_RECORD[run.operation] : null,
      errorCode: run.errorCode,
      startedAt: run.createdAt,
    }
  }

  /** Une génération du jeu, dans n'importe quelle langue, a démarré après `startedAfter` et tourne encore. */
  async hasRunningGeneration(
    gameId: string,
    startedAfter: Date,
  ): Promise<boolean> {
    const count = await this.txHost.tx.gameAggregationRun.count({
      where: {
        gameId,
        status: GameAggregationStatus.RUNNING,
        operation: GameAggregationOperationRecord.GENERATION,
        createdAt: { gt: startedAfter },
      },
    })
    return count > 0
  }

  /** Clôt un run en SUCCESS. À appeler dans la transaction qui enregistre la fiche. */
  async recordSuccess({
    runId,
    durationMs,
    trace,
  }: RecordGameAggregationSuccessParams): Promise<void> {
    try {
      await this.txHost.tx.gameAggregationRun.update({
        where: { id: runId },
        data: {
          status: GameAggregationStatus.SUCCESS,
          durationMs: Math.round(durationMs),
          ...traceToColumns(trace),
        },
      })
    } catch (writeError) {
      rethrowPrismaError(writeError)
    }
  }

  /**
   * Clôt un run en FAILURE. La durée et la trace de l'IA ne sont connues que
   * pour une GameAggregationFailedError.
   */
  async recordFailure({
    runId,
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
      await this.txHost.tx.gameAggregationRun.update({
        where: { id: runId },
        data: {
          status: GameAggregationStatus.FAILURE,
          ...(aggregation
            ? { durationMs: Math.round(aggregation.durationMs) }
            : {}),
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
