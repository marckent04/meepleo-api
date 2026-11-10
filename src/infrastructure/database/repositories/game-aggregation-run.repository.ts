import { Injectable } from '@nestjs/common'
import { TransactionHost } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import { redactSecrets } from '@/infrastructure/logger/redact.util'
import {
  AppError,
  ErrorCode,
  GameAggregationFailedError,
  type GameAggregationOperation,
  type GameAggregationRunOperation,
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
  operation: GameAggregationRunOperation
  /** Source language of a translation. */
  sourceLanguage?: string | null
  /** AI model planned for the operation. */
  model: string
}

export type RecordGameAggregationSuccessParams = {
  runId: string
  /** Total duration of the operation (AI calls + saving), in ms. */
  durationMs: number
  trace: AiTrace
}

export type RecordGameAggregationFailureParams = {
  runId: string
  error: unknown
}

const OPERATION_TO_RECORD: Record<
  GameAggregationRunOperation,
  GameAggregationOperationRecord
> = {
  generation: GameAggregationOperationRecord.GENERATION,
  translation: GameAggregationOperationRecord.TRANSLATION,
  scoring: GameAggregationOperationRecord.SCORING,
}

/** Sheet operations; a run without operation failed before the AI call. */
const SHEET_OPERATION_FROM_RECORD: Partial<
  Record<GameAggregationOperationRecord, GameAggregationOperation>
> = {
  GENERATION: 'generation',
  TRANSLATION: 'translation',
}

/**
 * Runs of the sheet lifecycle: score sheet template runs never make a sheet
 * pending nor put it in failure cooldown.
 */
const SHEET_RUNS = {
  OR: [
    { operation: null },
    {
      operation: {
        in: [
          GameAggregationOperationRecord.GENERATION,
          GameAggregationOperationRecord.TRANSLATION,
        ],
      },
    },
  ],
} satisfies Prisma.GameAggregationRunWhereInput

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

/** Columns coming from the AI trace: duration, usage, raw output. */
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
 * Trace of each aggregation attempt (sheet, score sheet template). A run is created RUNNING at
 * launch, then moved to SUCCESS or FAILURE. The latest successful generation
 * run is authoritative: it is what marks the sheet as generated.
 */
@Injectable()
export class GameAggregationRunRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {}

  /** Creates the RUNNING run of an aggregation that starts; returns its id. */
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

  /** Most recent sheet run of the game in `language`, whatever its status. */
  async findLatest(
    gameId: string,
    language: string,
  ): Promise<GameAggregationRunSummary | null> {
    const run = await this.txHost.tx.gameAggregationRun.findFirst({
      where: { gameId, language, ...SHEET_RUNS },
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
      operation: run.operation
        ? (SHEET_OPERATION_FROM_RECORD[run.operation] ?? null)
        : null,
      errorCode: run.errorCode,
      startedAt: run.createdAt,
    }
  }

  /** A generation of the game, in any language, started after `startedAfter` and is still running. */
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

  /** Closes a run as SUCCESS. To call in the transaction that saves the sheet. */
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
   * Closes a run as FAILURE. The duration and the AI trace are only known
   * for a GameAggregationFailedError.
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
