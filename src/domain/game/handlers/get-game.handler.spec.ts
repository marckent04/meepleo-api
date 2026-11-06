import { CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import {
  GameAggregationRunRepository,
  GameRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import {
  CQRSValidationException,
  ErrorCode,
  GameAggregationFailedError,
  NotFoundError,
} from '@/shared/errors'
import type { GameSheet } from '@/shared/types'
import { AggregateGameSheetCommand } from '../commands'
import { GetGameQuery } from '../queries'
import { GetGameHandler } from './get-game.handler'

const gameId = '0195d1a2-0000-7000-8000-000000000001'
const sheet = { gameId, language: 'fr' } as GameSheet

describe('GetGameHandler', () => {
  let handler: GetGameHandler
  const commandBus = { execute: vi.fn() }
  const gameRepository = { findSheet: vi.fn() }
  const gameAggregationRunRepository = { recordFailure: vi.fn() }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        GetGameHandler,
        { provide: CommandBus, useValue: commandBus },
        { provide: GameRepository, useValue: gameRepository },
        {
          provide: GameAggregationRunRepository,
          useValue: gameAggregationRunRepository,
        },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile()
    handler = moduleRef.get(GetGameHandler)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  const execute = () =>
    handler.execute(new GetGameQuery({ gameId, language: 'fr' }))

  it('returns an aggregated sheet without aggregating', async () => {
    gameRepository.findSheet.mockResolvedValue(sheet)

    await expect(execute()).resolves.toBe(sheet)

    expect(gameRepository.findSheet).toHaveBeenCalledWith(gameId, 'fr')
    expect(commandBus.execute).not.toHaveBeenCalled()
  })

  it('aggregates a sheet that is missing in the language', async () => {
    gameRepository.findSheet.mockResolvedValue(null)
    commandBus.execute.mockResolvedValue(sheet)

    await expect(execute()).resolves.toBe(sheet)

    expect(commandBus.execute).toHaveBeenCalledWith(
      new AggregateGameSheetCommand({ gameId, language: 'fr' }),
    )
  })

  it('records an aggregation failure and rethrows it', async () => {
    const error = new GameAggregationFailedError({
      operation: 'generation',
      model: 'claude-haiku-5-5',
      durationMs: 10,
      cause: new Error('boom'),
    })
    gameRepository.findSheet.mockResolvedValue(null)
    commandBus.execute.mockRejectedValue(error)

    await expect(execute()).rejects.toBe(error)

    expect(gameAggregationRunRepository.recordFailure).toHaveBeenCalledWith({
      gameId,
      language: 'fr',
      error,
    })
  })

  it('keeps the original error when recording fails', async () => {
    const error = new Error('boom')
    gameRepository.findSheet.mockResolvedValue(null)
    commandBus.execute.mockRejectedValue(error)
    gameAggregationRunRepository.recordFailure.mockRejectedValue(
      new Error('db down'),
    )

    await expect(execute()).rejects.toBe(error)
    expect(mockLoggerService.error).toHaveBeenCalled()
  })

  it('does not record a game that disappeared', async () => {
    gameRepository.findSheet.mockResolvedValue(null)
    commandBus.execute.mockRejectedValue(
      new NotFoundError('Game not found', { code: ErrorCode.GAME_NOT_FOUND }),
    )

    await expect(execute()).rejects.toMatchObject({
      code: ErrorCode.GAME_NOT_FOUND,
    })
    expect(gameAggregationRunRepository.recordFailure).not.toHaveBeenCalled()
  })

  it('propagates GAME_NOT_FOUND for an unknown game', async () => {
    gameRepository.findSheet.mockRejectedValue(
      new NotFoundError('Game not found', { code: ErrorCode.GAME_NOT_FOUND }),
    )

    await expect(execute()).rejects.toMatchObject({
      code: ErrorCode.GAME_NOT_FOUND,
    })
    expect(commandBus.execute).not.toHaveBeenCalled()
  })

  it('rejects an invalid game id', async () => {
    const error = await handler
      .execute(new GetGameQuery({ gameId: 'nope', language: 'fr' }))
      .catch((e) => e)

    expect(error).toBeInstanceOf(CQRSValidationException)
    expect(error.statusCode).toBe(400)
  })
})
