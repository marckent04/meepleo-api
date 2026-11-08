import type { AiTrace } from '../types/ai-trace.type'
import { AppError } from './app-error'
import { ErrorCode } from './error-codes'

export type AiCallFailedErrorParams = {
  /** Default code when the cause is not an AppError. */
  code: ErrorCode
  /** Partial trace: calls made and tokens consumed before the failure. */
  trace: AiTrace
  cause: unknown
}

/**
 * Failure of an AI operation, with the trace of what was consumed. Takes over
 * the message, code, status and details of the cause when it is an
 * AppError: the client response is unchanged.
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
