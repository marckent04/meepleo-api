import { CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import {
  GameSheetGenerator,
  GameSheetTranslator,
} from '@/infrastructure/adapters/anthropic'
import { GameRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import {
  ErrorCode,
  GameAggregationFailedError,
  InternalError,
} from '@/shared/errors'
import type { GameSheet, GameSheetTranslation } from '@/shared/types'
import {
  GenerateGameSheetCommand,
  TranslateGameSheetCommand,
} from '../../game-sheet/commands'
import { AggregateGameSheetCommand } from '../commands'
import { AggregateGameSheetHandler } from './aggregate-game-sheet.handler'

// La transaction est testée de bout en bout ; ici, on teste la décision.
vi.mock('@nestjs-cls/transactional', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Transactional: () => () => undefined,
}))

const gameId = '0195d1a2-0000-7000-8000-000000000001'
const stored = { gameId, language: 'en' } as GameSheet

describe('AggregateGameSheetHandler', () => {
  let handler: AggregateGameSheetHandler
  const commandBus = { execute: vi.fn() }
  const gameRepository = {
    lockById: vi.fn(),
    findSheet: vi.fn(),
    findSheetStatus: vi.fn(),
    saveGeneratedSheet: vi.fn(),
    saveTranslation: vi.fn(),
  }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AggregateGameSheetHandler,
        { provide: CommandBus, useValue: commandBus },
        { provide: GameRepository, useValue: gameRepository },
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

  const execute = () =>
    handler.execute(new AggregateGameSheetCommand({ gameId, language: 'en' }))

  it('returns the sheet aggregated while waiting for the lock', async () => {
    gameRepository.findSheet.mockResolvedValue(stored)

    await expect(execute()).resolves.toBe(stored)

    expect(gameRepository.lockById).toHaveBeenCalledWith(gameId)
    expect(gameRepository.lockById.mock.invocationCallOrder[0]).toBeLessThan(
      gameRepository.findSheet.mock.invocationCallOrder[0],
    )
    expect(commandBus.execute).not.toHaveBeenCalled()
  })

  it('generates the sheet of a game that has none', async () => {
    const generated = { gameId } as GameSheet
    gameRepository.findSheet
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(stored)
    gameRepository.findSheetStatus.mockResolvedValue({
      generated: false,
      supportedLanguages: [],
    })
    commandBus.execute.mockResolvedValue(generated)

    await expect(execute()).resolves.toBe(stored)

    expect(commandBus.execute).toHaveBeenCalledWith(
      new GenerateGameSheetCommand({ gameId, language: 'en' }),
    )
    expect(gameRepository.saveGeneratedSheet).toHaveBeenCalledWith(generated)
    expect(gameRepository.saveTranslation).not.toHaveBeenCalled()
  })

  it('translates from the generation language when a sheet exists', async () => {
    const translation = { gameId } as GameSheetTranslation
    gameRepository.findSheet
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(stored)
    gameRepository.findSheetStatus.mockResolvedValue({
      generated: true,
      supportedLanguages: ['fr', 'de'],
    })
    commandBus.execute.mockResolvedValue(translation)

    await expect(execute()).resolves.toBe(stored)

    expect(commandBus.execute).toHaveBeenCalledWith(
      new TranslateGameSheetCommand({
        gameId,
        sourceLanguage: 'fr',
        targetLanguage: 'en',
      }),
    )
    expect(gameRepository.saveTranslation).toHaveBeenCalledWith(translation)
    expect(gameRepository.saveGeneratedSheet).not.toHaveBeenCalled()
  })

  it.each([
    [
      'generation',
      { generated: false, supportedLanguages: [] },
      'claude-opus-5-5',
      null,
    ],
    [
      'translation',
      { generated: true, supportedLanguages: ['fr'] },
      'claude-haiku-5-5',
      'fr',
    ],
  ])(
    'wraps a %s failure with its operation and model',
    async (operation, status, model, sourceLanguage) => {
      const cause = new InternalError('Anthropic API call failed', {
        code: ErrorCode.GAME_SHEET_GENERATION_FAILED,
      })
      gameRepository.findSheet.mockResolvedValue(null)
      gameRepository.findSheetStatus.mockResolvedValue(status)
      commandBus.execute.mockRejectedValue(cause)

      const error = await execute().catch((e) => e)

      expect(error).toBeInstanceOf(GameAggregationFailedError)
      expect(error).toMatchObject({ operation, model, sourceLanguage, cause })
      expect(error.code).toBe(ErrorCode.GAME_SHEET_GENERATION_FAILED)
    },
  )

  it('does not wrap a missing game', async () => {
    const notFound = Object.assign(new Error('Game not found'), {
      code: ErrorCode.GAME_NOT_FOUND,
    })
    gameRepository.lockById.mockRejectedValue(notFound)

    await expect(execute()).rejects.toBe(notFound)
  })
})
