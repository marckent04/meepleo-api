import { buildAiTrace } from '@/__tests__/utils/ai-trace.fixture'
import { AiCallFailedError } from './ai-call-failed.error'
import { InternalError, NotFoundError } from './app-error'
import { ErrorCode } from './error-codes'
import { GameAggregationFailedError } from './game-aggregation-failed.error'

describe('GameAggregationFailedError', () => {
  it('keeps the code, status and details of an AppError cause', () => {
    const cause = new NotFoundError('Source game sheet not found', {
      details: { gameId: 'g' },
    })

    const error = new GameAggregationFailedError({
      operation: 'translation',
      model: 'claude-haiku-5-5',
      sourceLanguage: 'fr',
      durationMs: 42,
      cause,
    })

    expect(error.statusCode).toBe(404)
    expect(error.code).toBe(ErrorCode.NOT_FOUND)
    expect(error.cause).toBe(cause)
    expect(error.details).toEqual({
      gameId: 'g',
      operation: 'translation',
      model: 'claude-haiku-5-5',
      sourceLanguage: 'fr',
    })
  })

  it.each([
    ['generation', ErrorCode.GAME_SHEET_GENERATION_FAILED],
    ['translation', ErrorCode.GAME_SHEET_TRANSLATION_FAILED],
  ] as const)('defaults a %s failure to %s (500)', (operation, code) => {
    const error = new GameAggregationFailedError({
      operation,
      model: 'm',
      durationMs: 1,
      cause: new TypeError('boom'),
    })

    expect(error.statusCode).toBe(500)
    expect(error.code).toBe(code)
    expect(error.message).toContain('boom')
    expect(error.sourceLanguage).toBeNull()
    expect(error.trace).toBeNull()
  })

  it('keeps the AI trace and the duration of an AiCallFailedError cause', () => {
    const trace = buildAiTrace({ stopReason: 'max_tokens' })
    const cause = new AiCallFailedError({
      code: ErrorCode.GAME_SHEET_GENERATION_FAILED,
      trace,
      cause: new InternalError('Unexpected stop reason', {
        code: ErrorCode.GAME_SHEET_GENERATION_FAILED,
        details: { stopReason: 'max_tokens' },
      }),
    })

    const error = new GameAggregationFailedError({
      operation: 'generation',
      model: 'claude-haiku-5-5',
      durationMs: 5000,
      cause,
    })

    expect(error.trace).toBe(trace)
    expect(error.durationMs).toBe(5000)
    expect(error.code).toBe(ErrorCode.GAME_SHEET_GENERATION_FAILED)
    expect(error.statusCode).toBe(500)
    expect(error.details).toMatchObject({ stopReason: 'max_tokens' })
  })

  it('is not mistaken for its cause', () => {
    const error = new GameAggregationFailedError({
      operation: 'generation',
      model: 'm',
      durationMs: 1,
      cause: new InternalError('x'),
    })
    expect(error).not.toBeInstanceOf(InternalError)
  })
})
