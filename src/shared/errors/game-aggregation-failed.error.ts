import type { AiTrace } from '../types/ai-trace.type'
import { AiCallFailedError } from './ai-call-failed.error'
import { AppError } from './app-error'
import { ErrorCode } from './error-codes'

export type GameAggregationOperation = 'generation' | 'translation'

export type GameAggregationFailedErrorParams = {
  operation: GameAggregationOperation
  /** AI model used for the attempt. */
  model: string
  /** Source language of a translation. */
  sourceLanguage?: string | null
  /** Duration of the attempt until the failure, in ms. */
  durationMs: number
  cause: unknown
}

/**
 * Failure of a sheet aggregation (generation or translation). Takes over the code,
 * status and details of the cause when it is an AppError: the client
 * response is unchanged, but the operation, model, duration and AI trace
 * (if the failure occurred during the call) remain traceable.
 */
export class GameAggregationFailedError extends AppError {
  readonly statusCode: number
  readonly operation: GameAggregationOperation
  readonly model: string
  readonly sourceLanguage: string | null
  readonly durationMs: number
  readonly trace: AiTrace | null

  constructor({
    operation,
    model,
    sourceLanguage = null,
    durationMs,
    cause,
  }: GameAggregationFailedErrorParams) {
    const appCause = cause instanceof AppError ? cause : undefined
    const causeMessage = cause instanceof Error ? cause.message : String(cause)
    super(
      `Game sheet ${operation} failed: ${causeMessage}`,
      appCause?.code ??
        (operation === 'generation'
          ? ErrorCode.GAME_SHEET_GENERATION_FAILED
          : ErrorCode.GAME_SHEET_TRANSLATION_FAILED),
      {
        details: { ...appCause?.details, operation, model, sourceLanguage },
        params: appCause?.params,
        fields: appCause?.fields,
        cause,
      },
    )
    this.statusCode = appCause?.statusCode ?? 500
    this.operation = operation
    this.model = model
    this.sourceLanguage = sourceLanguage
    this.durationMs = durationMs
    this.trace = cause instanceof AiCallFailedError ? cause.trace : null
  }
}
