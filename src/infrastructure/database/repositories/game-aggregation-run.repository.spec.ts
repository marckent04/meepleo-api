import { buildAiTrace } from '@/__tests__/utils/ai-trace.fixture'
import { createTransactionHostMock } from '@/__tests__/utils/prisma.mock'
import {
  AiCallFailedError,
  ErrorCode,
  GameAggregationFailedError,
  InternalError,
} from '@/shared/errors'
import { GAME_ID } from '../__fixtures__/game-record.fixture'
import { GameAggregationRunRepository } from './game-aggregation-run.repository'

const trace = buildAiTrace({
  model: 'claude-haiku-5-5-20261001',
  requestCount: 2,
  durationMs: 4200,
  usage: {
    inputTokens: 12_000,
    outputTokens: 3_000,
    cacheCreationInputTokens: 100,
    cacheReadInputTokens: 50,
    webSearchRequests: 3,
    webFetchRequests: 1,
  },
  output: { description: 'D' },
})

const traceColumns = {
  model: 'claude-haiku-5-5-20261001',
  aiDurationMs: 4200,
  requestCount: 2,
  inputTokens: 12_000,
  outputTokens: 3_000,
  cacheCreationInputTokens: 100,
  cacheReadInputTokens: 50,
  webSearchRequests: 3,
  webFetchRequests: 1,
  stopReason: 'end_turn',
  promptVersion: trace.promptVersion,
  settings: trace.settings,
  output: { description: 'D' },
  rawText: null,
}

describe('GameAggregationRunRepository', () => {
  function setup() {
    const { host, tx } = createTransactionHostMock({
      gameAggregationRun: { create: vi.fn() },
    })
    return { repository: new GameAggregationRunRepository(host), tx }
  }

  it('records a successful generation with its duration, usage and raw output', async () => {
    const { repository, tx } = setup()

    await repository.recordSuccess({
      gameId: GAME_ID,
      language: 'fr',
      operation: 'generation',
      durationMs: 4567.8,
      trace,
    })

    expect(tx.gameAggregationRun.create).toHaveBeenCalledWith({
      data: {
        gameId: GAME_ID,
        status: 'SUCCESS',
        language: 'fr',
        operation: 'GENERATION',
        sourceLanguage: null,
        durationMs: 4568,
        ...traceColumns,
      },
    })
  })

  it('records a successful translation with its source language', async () => {
    const { repository, tx } = setup()

    await repository.recordSuccess({
      gameId: GAME_ID,
      language: 'en',
      operation: 'translation',
      sourceLanguage: 'fr',
      durationMs: 10,
      trace,
    })

    expect(tx.gameAggregationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'SUCCESS',
        operation: 'TRANSLATION',
        sourceLanguage: 'fr',
      }),
    })
  })

  it('records a failed AI call with the trace of what was consumed', async () => {
    const { repository, tx } = setup()
    const cause = new InternalError('Anthropic API call failed', {
      code: ErrorCode.GAME_SHEET_TRANSLATION_FAILED,
      details: { status: 529, apiKey: 'sk-secret' },
    })

    await repository.recordFailure({
      gameId: GAME_ID,
      language: 'en',
      error: new GameAggregationFailedError({
        operation: 'translation',
        model: 'claude-haiku-5-5',
        sourceLanguage: 'fr',
        durationMs: 5000,
        cause: new AiCallFailedError({
          code: ErrorCode.GAME_SHEET_TRANSLATION_FAILED,
          trace,
          cause,
        }),
      }),
    })

    expect(tx.gameAggregationRun.create).toHaveBeenCalledWith({
      data: {
        gameId: GAME_ID,
        status: 'FAILURE',
        language: 'en',
        operation: 'TRANSLATION',
        sourceLanguage: 'fr',
        durationMs: 5000,
        ...traceColumns,
        errorCode: ErrorCode.GAME_SHEET_TRANSLATION_FAILED,
        errorMessage: 'Anthropic API call failed',
        errorDetails: {
          status: 529,
          apiKey: '[REDACTED]',
          operation: 'translation',
          model: 'claude-haiku-5-5',
          sourceLanguage: 'fr',
        },
      },
    })
  })

  it('records an aggregation failure that happened after the AI call without trace', async () => {
    const { repository, tx } = setup()

    await repository.recordFailure({
      gameId: GAME_ID,
      language: 'fr',
      error: new GameAggregationFailedError({
        operation: 'generation',
        model: 'claude-haiku-5-5',
        durationMs: 120,
        cause: new Error('Unique constraint failed'),
      }),
    })

    expect(tx.gameAggregationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'FAILURE',
        operation: 'GENERATION',
        model: 'claude-haiku-5-5',
        durationMs: 120,
        errorCode: ErrorCode.GAME_SHEET_GENERATION_FAILED,
        errorMessage: 'Unique constraint failed',
      }),
    })
    const { data } = tx.gameAggregationRun.create.mock.calls[0][0]
    expect(data).not.toHaveProperty('inputTokens')
  })

  it('records an error raised outside of the AI call without operation nor model', async () => {
    const { repository, tx } = setup()

    await repository.recordFailure({
      gameId: GAME_ID,
      language: 'fr',
      error: new Error('Transaction already closed'),
    })

    expect(tx.gameAggregationRun.create).toHaveBeenCalledWith({
      data: {
        gameId: GAME_ID,
        status: 'FAILURE',
        language: 'fr',
        operation: null,
        sourceLanguage: null,
        model: null,
        durationMs: 0,
        errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
        errorMessage: 'Transaction already closed',
        errorDetails: undefined,
      },
    })
  })
})
