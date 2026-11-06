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

const RUN_ID = '0195d1a2-0000-7000-8000-0000000000aa'

describe('GameAggregationRunRepository', () => {
  function setup() {
    const { host, tx } = createTransactionHostMock({
      gameAggregationRun: {
        create: vi.fn(),
        update: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
      },
    })
    return { repository: new GameAggregationRunRepository(host), tx }
  }

  it('starts a RUNNING run and returns its id', async () => {
    const { repository, tx } = setup()
    tx.gameAggregationRun.create.mockResolvedValue({ id: RUN_ID })

    const id = await repository.start({
      gameId: GAME_ID,
      language: 'en',
      operation: 'translation',
      sourceLanguage: 'fr',
      model: 'claude-haiku-5-5',
    })

    expect(id).toBe(RUN_ID)
    expect(tx.gameAggregationRun.create).toHaveBeenCalledWith({
      data: {
        gameId: GAME_ID,
        status: 'RUNNING',
        language: 'en',
        operation: 'TRANSLATION',
        sourceLanguage: 'fr',
        model: 'claude-haiku-5-5',
        durationMs: 0,
      },
      select: { id: true },
    })
  })

  it('maps the latest run of a game in a language', async () => {
    const { repository, tx } = setup()
    const createdAt = new Date('2026-11-06T10:00:00Z')
    tx.gameAggregationRun.findFirst.mockResolvedValue({
      id: RUN_ID,
      status: 'FAILURE',
      operation: 'GENERATION',
      errorCode: ErrorCode.GAME_SHEET_GENERATION_FAILED,
      createdAt,
    })

    await expect(repository.findLatest(GAME_ID, 'fr')).resolves.toEqual({
      id: RUN_ID,
      status: 'failure',
      operation: 'generation',
      errorCode: ErrorCode.GAME_SHEET_GENERATION_FAILED,
      startedAt: createdAt,
    })
    expect(tx.gameAggregationRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { gameId: GAME_ID, language: 'fr' },
        orderBy: { createdAt: 'desc' },
      }),
    )
  })

  it('returns null when the game has no run in the language', async () => {
    const { repository, tx } = setup()
    tx.gameAggregationRun.findFirst.mockResolvedValue(null)

    await expect(repository.findLatest(GAME_ID, 'fr')).resolves.toBeNull()
  })

  it('looks for a recent running generation in any language', async () => {
    const { repository, tx } = setup()
    const since = new Date('2026-11-06T10:00:00Z')
    tx.gameAggregationRun.count.mockResolvedValue(1)

    await expect(repository.hasRunningGeneration(GAME_ID, since)).resolves.toBe(
      true,
    )
    expect(tx.gameAggregationRun.count).toHaveBeenCalledWith({
      where: {
        gameId: GAME_ID,
        status: 'RUNNING',
        operation: 'GENERATION',
        createdAt: { gt: since },
      },
    })
  })

  it('closes a run in SUCCESS with its duration, usage and raw output', async () => {
    const { repository, tx } = setup()

    await repository.recordSuccess({ runId: RUN_ID, durationMs: 4567.8, trace })

    expect(tx.gameAggregationRun.update).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: { status: 'SUCCESS', durationMs: 4568, ...traceColumns },
    })
  })

  it('closes a run in FAILURE with the trace of what was consumed', async () => {
    const { repository, tx } = setup()
    const cause = new InternalError('Anthropic API call failed', {
      code: ErrorCode.GAME_SHEET_TRANSLATION_FAILED,
      details: { status: 529, apiKey: 'sk-secret' },
    })

    await repository.recordFailure({
      runId: RUN_ID,
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

    expect(tx.gameAggregationRun.update).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: {
        status: 'FAILURE',
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

  it('closes a run in FAILURE without trace when the failure came after the AI call', async () => {
    const { repository, tx } = setup()

    await repository.recordFailure({
      runId: RUN_ID,
      error: new GameAggregationFailedError({
        operation: 'generation',
        model: 'claude-haiku-5-5',
        durationMs: 120,
        cause: new Error('Unique constraint failed'),
      }),
    })

    const { data } = tx.gameAggregationRun.update.mock.calls[0][0]
    expect(data).toMatchObject({
      status: 'FAILURE',
      durationMs: 120,
      errorCode: ErrorCode.GAME_SHEET_GENERATION_FAILED,
      errorMessage: 'Unique constraint failed',
    })
    expect(data).not.toHaveProperty('inputTokens')
  })

  it('closes a run in FAILURE for an error raised outside of the AI call', async () => {
    const { repository, tx } = setup()

    await repository.recordFailure({
      runId: RUN_ID,
      error: new Error('Transaction already closed'),
    })

    expect(tx.gameAggregationRun.update).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: {
        status: 'FAILURE',
        errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
        errorMessage: 'Transaction already closed',
        errorDetails: undefined,
      },
    })
  })
})
