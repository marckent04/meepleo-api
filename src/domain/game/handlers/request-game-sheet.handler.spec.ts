import { EventBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import {
  GameSheetGenerator,
  GameSheetTranslator,
} from '@/infrastructure/adapters/anthropic'
import {
  GameAggregationRunRepository,
  GameRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { ErrorCode, InternalError } from '@/shared/errors'
import type { GameAggregationRunSummary, GameSheet } from '@/shared/types'
import { RequestGameSheetCommand } from '../commands'
import { GameSheetAggregationStartedEvent } from '../events'
import { AGGREGATION_STALE_AFTER_MS } from '../game-sheet-aggregation.constants'
import { RequestGameSheetHandler } from './request-game-sheet.handler'

// The transaction is tested end to end; here we test the decision.
vi.mock('@nestjs-cls/transactional', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Transactional: () => () => undefined,
}))

const gameId = '0195d1a2-0000-7000-8000-000000000001'
const runId = '0195d1a2-0000-7000-8000-0000000000aa'
const newRunId = '0195d1a2-0000-7000-8000-0000000000bb'
const sheet = { gameId, language: 'en' } as GameSheet
const FAILURE_COOLDOWN_MS = 120_000
const NOW = new Date('2026-11-06T12:00:00Z').getTime()

function run(
  overrides: Partial<GameAggregationRunSummary>,
): GameAggregationRunSummary {
  return {
    id: runId,
    status: 'running',
    operation: 'generation',
    errorCode: null,
    startedAt: new Date(NOW - 1000),
    ...overrides,
  }
}

describe('RequestGameSheetHandler', () => {
  let handler: RequestGameSheetHandler
  const eventBus = { publish: vi.fn() }
  const gameRepository = {
    lockById: vi.fn(),
    findSheet: vi.fn(),
    findSheetStatus: vi.fn(),
  }
  const gameAggregationRunRepository = {
    findLatest: vi.fn(),
    hasRunningGeneration: vi.fn(),
    start: vi.fn(),
    recordFailure: vi.fn(),
  }

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW })
    const moduleRef = await Test.createTestingModule({
      providers: [
        RequestGameSheetHandler,
        { provide: EventBus, useValue: eventBus },
        { provide: GameRepository, useValue: gameRepository },
        {
          provide: GameAggregationRunRepository,
          useValue: gameAggregationRunRepository,
        },
        {
          provide: GameSheetGenerator,
          useValue: {
            model: 'claude-opus-5-5',
            failureCooldownMs: FAILURE_COOLDOWN_MS,
          },
        },
        {
          provide: GameSheetTranslator,
          useValue: { model: 'claude-haiku-5-5' },
        },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile()
    handler = moduleRef.get(RequestGameSheetHandler)

    gameRepository.findSheet.mockResolvedValue(null)
    gameAggregationRunRepository.findLatest.mockResolvedValue(null)
    gameAggregationRunRepository.hasRunningGeneration.mockResolvedValue(false)
    gameAggregationRunRepository.start.mockResolvedValue(newRunId)
    gameRepository.findSheetStatus.mockResolvedValue({
      generated: false,
      supportedLanguages: [],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetAllMocks()
  })

  const execute = () =>
    handler.execute(new RequestGameSheetCommand({ gameId, language: 'en' }))

  it('returns an existing sheet without taking the lock', async () => {
    gameRepository.findSheet.mockResolvedValue(sheet)

    await expect(execute()).resolves.toEqual({ status: 'ready', sheet })

    expect(gameRepository.findSheet).toHaveBeenCalledWith(gameId, 'en')
    expect(gameRepository.lockById).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('returns the sheet aggregated while waiting for the lock', async () => {
    gameRepository.findSheet
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(sheet)

    await expect(execute()).resolves.toEqual({ status: 'ready', sheet })

    expect(gameRepository.lockById.mock.invocationCallOrder[0]).toBeLessThan(
      gameRepository.findSheet.mock.invocationCallOrder[1],
    )
    expect(gameAggregationRunRepository.start).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('starts a generation for a game without sheet', async () => {
    await expect(execute()).resolves.toEqual({
      status: 'pending',
      job: {
        runId: newRunId,
        gameId,
        language: 'en',
        operation: 'generation',
        sourceLanguage: null,
      },
    })
    expect(gameAggregationRunRepository.start).toHaveBeenCalledWith({
      gameId,
      language: 'en',
      operation: 'generation',
      sourceLanguage: null,
      model: 'claude-opus-5-5',
    })
    // Published once the run is created, so the saga starts the aggregation.
    expect(eventBus.publish).toHaveBeenCalledWith(
      new GameSheetAggregationStartedEvent({
        runId: newRunId,
        gameId,
        language: 'en',
        operation: 'generation',
        sourceLanguage: null,
      }),
    )
    expect(
      gameAggregationRunRepository.start.mock.invocationCallOrder[0],
    ).toBeLessThan(eventBus.publish.mock.invocationCallOrder[0])
  })

  it('starts a translation from the generation language', async () => {
    gameRepository.findSheetStatus.mockResolvedValue({
      generated: true,
      supportedLanguages: ['fr', 'de'],
    })

    await expect(execute()).resolves.toMatchObject({
      status: 'pending',
      job: { operation: 'translation', sourceLanguage: 'fr' },
    })
    expect(gameAggregationRunRepository.start).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLanguage: 'fr',
        model: 'claude-haiku-5-5',
      }),
    )
  })

  it('does not start anything while an aggregation is running', async () => {
    gameAggregationRunRepository.findLatest.mockResolvedValue(run({}))

    await expect(execute()).resolves.toEqual({ status: 'pending', job: null })
    expect(gameAggregationRunRepository.start).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('waits for a generation running in another language', async () => {
    gameAggregationRunRepository.hasRunningGeneration.mockResolvedValue(true)

    await expect(execute()).resolves.toEqual({ status: 'pending', job: null })
    expect(
      gameAggregationRunRepository.hasRunningGeneration,
    ).toHaveBeenCalledWith(gameId, new Date(NOW - AGGREGATION_STALE_AFTER_MS))
    expect(gameAggregationRunRepository.start).not.toHaveBeenCalled()
  })

  it('abandons a stale running aggregation and starts a new one', async () => {
    gameAggregationRunRepository.findLatest.mockResolvedValue(
      run({ startedAt: new Date(NOW - AGGREGATION_STALE_AFTER_MS - 1) }),
    )

    await expect(execute()).resolves.toMatchObject({
      status: 'pending',
      job: { runId: newRunId },
    })
    const { runId: abandoned, error } =
      gameAggregationRunRepository.recordFailure.mock.calls[0][0]
    expect(abandoned).toBe(runId)
    expect(error).toBeInstanceOf(InternalError)
    expect(error.code).toBe(ErrorCode.GAME_SHEET_GENERATION_FAILED)
  })

  it.each([
    ['generation', ErrorCode.GAME_SHEET_GENERATION_FAILED],
    ['translation', ErrorCode.GAME_SHEET_TRANSLATION_FAILED],
  ] as const)(
    'returns a recent %s failure without retrying',
    async (operation, code) => {
      gameAggregationRunRepository.findLatest.mockResolvedValue(
        run({ status: 'failure', operation, errorCode: code }),
      )

      const error = await execute().catch((e) => e)

      expect(error).toBeInstanceOf(InternalError)
      expect(error.code).toBe(code)
      expect(error.statusCode).toBe(500)
      expect(gameAggregationRunRepository.start).not.toHaveBeenCalled()
    },
  )

  it('retries once the failure cooldown is over', async () => {
    gameAggregationRunRepository.findLatest.mockResolvedValue(
      run({
        status: 'failure',
        startedAt: new Date(NOW - FAILURE_COOLDOWN_MS - 1),
      }),
    )

    await expect(execute()).resolves.toMatchObject({
      status: 'pending',
      job: { runId: newRunId },
    })
  })

  it('propagates GAME_NOT_FOUND for an unknown game', async () => {
    const notFound = Object.assign(new Error('Game not found'), {
      code: ErrorCode.GAME_NOT_FOUND,
    })
    gameRepository.lockById.mockRejectedValue(notFound)

    await expect(execute()).rejects.toBe(notFound)
    expect(gameAggregationRunRepository.start).not.toHaveBeenCalled()
  })
})
