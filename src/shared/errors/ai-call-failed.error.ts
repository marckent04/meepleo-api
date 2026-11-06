import type { AiTrace } from '../types/ai-trace.type'
import { AppError } from './app-error'
import { ErrorCode } from './error-codes'

export type AiCallFailedErrorParams = {
  /** Code par défaut quand la cause n'est pas une AppError. */
  code: ErrorCode
  /** Trace partielle : appels effectués et tokens consommés avant l'échec. */
  trace: AiTrace
  cause: unknown
}

/**
 * Échec d'une opération d'IA, avec la trace de ce qui a été consommé. Reprend
 * le message, le code, le statut et les détails de la cause quand c'est une
 * AppError : la réponse client est inchangée.
 */
export class AiCallFailedError extends AppError {
  readonly statusCode: number
  readonly trace: AiTrace

  constructor({ code, trace, cause }: AiCallFailedErrorParams) {
    const appCause = cause instanceof AppError ? cause : undefined
    super(
      cause instanceof Error ? cause.message : String(cause),
      appCause?.code ?? code,
      {
        details: appCause?.details,
        params: appCause?.params,
        fields: appCause?.fields,
        cause,
      },
    )
    this.statusCode = appCause?.statusCode ?? 500
    this.trace = trace
  }
}
