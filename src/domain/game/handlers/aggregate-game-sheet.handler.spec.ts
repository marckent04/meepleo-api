import { CommandBus, EventBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { buildAiTrace } from '@/__tests__/utils/ai-trace.fixture'
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
import {
  AiCallFailedError,
  ErrorCode,
  GameAggregationFailedError,
  InternalError,
} from '@/shared/errors'
import type {
  GameSheet,
  GameSheetAggregationJob,
  GameSheetTranslation,
} from '@/shared/types'
import {
  GenerateGameSheetCommand,
  TranslateGameSheetCommand,
} from '../../game-sheet/commands'
import { AggregateGameSheetCommand } from '../commands'
import {
  GameSheetAggregatedEvent,
  GameSheetAggregationFailedEvent,
} from '../events'
import { AggregateGameSheetHandler } from './aggregate-game-sheet.handler'

// La transaction est testée de bout en bout ; ici, on teste l'enchaînement.
vi.mock('@nestjs-cls/transactional', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Transactional: () => () => undefined,
}))

const gameId = '0195d1a2-0000-7000-8000-000000000001'
const runId = '0195d1a2-0000-7000-8000-0000000000aa'
const trace = buildAiTrace()
const generationJob: GameSheetAggregationJob = {
  runId,
  gameId,
  language: 'en',
  operation: 'generation',
  sourceLanguage: null,
}
const translationJob: GameSheetAggregationJob = {
  ...generationJob,
  operation: 'translation',
  sourceLanguage: 'fr',
}

describe('AggregateGameSheetHandler', () => {
  let handler: AggregateGameSheetHandler
  const commandBus = { execute: vi.fn() }
  const eventBus = { publish: vi.fn() }
  const gameRepository = {
    lockById: vi.fn(),
    saveGeneratedSheet: vi.fn(),
    saveTranslation: vi.fn(),
  }
  const gameAggregationRunRepository = {
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
  }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AggregateGameSheetHandler,
        { provide: CommandBus, useValue: commandBus },
        { provide: EventBus, useValue: eventBus },
        { provide: GameRepository, useValue: gameRepository },
        {
          provide: GameAggregationRunRepository,
          useValue: gameAggregationRunRepository,
        },
        { provide: GameSheetGenerator, useValue: { model: 'claude-opus-5-5' } },
        {
          provide: GameSheetTranslator,
          useValue: { model: 'claude-haiku-5-5' },
        },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile()
    handler = moduleRef.get(AggregateGameSheetHandler)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  const execute = (job: GameSheetAggregationJob) =>
    handler.execute(new AggregateGameSheetCommand(job))

  it('generates the sheet, saves it under lock and closes the run', async () => {
    const generated = { gameId } as GameSheet
    commandBus.execute.mockResolvedValue({ result: generated, trace })

    await execute(generationJob)

    expect(commandBus.execute).toHaveBeenCalledWith(
      new GenerateGameSheetCommand({ gameId, language: 'en' }),
    )
    expect(gameRepository.saveGeneratedSheet).toHaveBeenCalledWith(generated)
    expect(gameRepository.saveTranslation).not.toHaveBeenCalled()
    expect(gameAggregationRunRepository.recordSuccess).toHaveBeenCalledWith({
      runId,
      durationMs: expect.any(Number),
      trace,
    })
    // Le verrou est pris après l'appel à l'IA, juste pour l'enregistrement.
    expect(commandBus.execute.mock.invocationCallOrder[0]).toBeLessThan(
      gameRepository.lockById.mock.invocationCallOrder[0],
    )
    expect(gameRepository.lockById.mock.invocationCallOrder[0]).toBeLessThan(
      gameRepository.saveGeneratedSheet.mock.invocationCallOrder[0],
    )
    expect(eventBus.publish).toHaveBeenCalledWith(
      new GameSheetAggregatedEvent(generationJob),
    )
    expect(
      gameAggregationRunRepository.recordSuccess.mock.invocationCallOrder[0],
    ).toBeLessThan(eventBus.publish.mock.invocationCallOrder[0])
  })

  it('translates from the source language and closes the run', async () => {
    const translation = { gameId } as GameSheetTranslation
    commandBus.execute.mockResolvedValue({ result: translation, trace })

    await execute(translationJob)

    expect(commandBus.execute).toHaveBeenCalledWith(
      new TranslateGameSheetCommand({
        gameId,
        sourceLanguage: 'fr',
        targetLanguage: 'en',
      }),
    )
    expect(gameRepository.saveTranslation).toHaveBeenCalledWith(translation)
    expect(gameRepository.saveGeneratedSheet).not.toHaveBeenCalled()
    expect(gameAggregationRunRepository.recordSuccess).toHaveBeenCalledWith({
      runId,
      durationMs: expect.any(Number),
      trace,
    })
  })

  it.each([
    ['generation', generationJob, 'claude-opus-5-5', null],
    ['translation', translationJob, 'claude-haiku-5-5', 'fr'],
  ])(
    'closes the run in FAILURE and rethrows a %s failure',
    async (operation, job, model, sourceLanguage) => {
      const cause = new InternalError('Anthropic API call failed', {
        code: ErrorCode.GAME_SHEET_GENERATION_FAILED,
      })
      commandBus.execute.mockRejectedValue(cause)

      const error = await execute(job).catch((e) => e)

      expect(error).toBeInstanceOf(GameAggregationFailedError)
      expect(error).toMatchObject({ operation, model, sourceLanguage, cause })
      expect(error.durationMs).toEqual(expect.any(Number))
      expect(gameAggregationRunRepository.recordFailure).toHaveBeenCalledWith({
        runId,
        error,
      })
      expect(gameAggregationRunRepository.recordSuccess).not.toHaveBeenCalled()
      expect(eventBus.publish).toHaveBeenCalledWith(
        new GameSheetAggregationFailedEvent(job, error),
      )
      expect(eventBus.publish).toHaveBeenCalledTimes(1)
    },
  )

  it('keeps the AI trace of a failed generation', async () => {
    commandBus.execute.mockRejectedValue(
      new AiCallFailedError({
        code: ErrorCode.GAME_SHEET_GENERATION_FAILED,
        trace,
        cause: new InternalError('Unexpected stop reason'),
      }),
    )

    const error = await execute(generationJob).catch((e) => e)

    expect(error.trace).toBe(trace)
  })

  it('closes the run in FAILURE when saving the sheet fails', async () => {
    commandBus.execute.mockResolvedValue({ result: {}, trace })
    gameRepository.saveGeneratedSheet.mockRejectedValue(new Error('db down'))

    const error = await execute(generationJob).catch((e) => e)

    expect(error).toBeInstanceOf(GameAggregationFailedError)
    expect(gameAggregationRunRepository.recordFailure).toHaveBeenCalledWith({
      runId,
      error,
    })
  })

  it('keeps the original error when closing the run fails', async () => {
    commandBus.execute.mockRejectedValue(new Error('boom'))
    gameAggregationRunRepository.recordFailure.mockRejectedValue(
      new Error('db down'),
    )

    const error = await execute(generationJob).catch((e) => e)

    expect(error).toBeInstanceOf(GameAggregationFailedError)
    expect(error.message).toContain('boom')
    expect(mockLoggerService.error).toHaveBeenCalled()
  })
})
