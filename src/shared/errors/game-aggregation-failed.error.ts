import type { AiTrace } from '../types/ai-trace.type'
import { AiCallFailedError } from './ai-call-failed.error'
import { AppError } from './app-error'
import { ErrorCode } from './error-codes'

export type GameAggregationOperation = 'generation' | 'translation'

export type GameAggregationFailedErrorParams = {
  operation: GameAggregationOperation
  /** Modèle d'IA utilisé pour la tentative. */
  model: string
  /** Langue source d'une traduction. */
  sourceLanguage?: string | null
  /** Durée de la tentative jusqu'à l'échec, en ms. */
  durationMs: number
  cause: unknown
}

/**
 * Échec d'une agrégation de fiche (génération ou traduction). Reprend le code,
 * le statut et les détails de la cause quand c'est une AppError : la réponse
 * client est inchangée, mais l'opération, le modèle, la durée et la trace de
 * l'IA (si l'échec est survenu pendant l'appel) restent traçables.
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
