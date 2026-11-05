import { Test } from '@nestjs/testing'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import { GameSheetGenerator } from '@/infrastructure/adapters/anthropic'
import { GameRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import {
  CQRSValidationException,
  ErrorCode,
  NotFoundError,
} from '@/shared/errors'
import { Game, type GameSheet } from '@/shared/types'
import { GenerateGameSheetCommand } from '../commands'
import { GenerateGameSheetHandler } from './generate-game-sheet.handler'

const gameId = '0195d1a2-0000-7000-8000-000000000001'
const game = new Game(gameId, 'Dnup', 2021, null, null, 123)

describe('GenerateGameSheetHandler', () => {
  let handler: GenerateGameSheetHandler
  const gameRepository = { findById: vi.fn() }
  const gameSheetGenerator = { generate: vi.fn() }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        GenerateGameSheetHandler,
        { provide: GameRepository, useValue: gameRepository },
        { provide: GameSheetGenerator, useValue: gameSheetGenerator },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile()
    handler = moduleRef.get(GenerateGameSheetHandler)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('loads the game and returns the generated sheet', async () => {
    const sheet = { gameId } as GameSheet
    gameRepository.findById.mockResolvedValue(game)
    gameSheetGenerator.generate.mockResolvedValue(sheet)

    const result = await handler.execute(
      new GenerateGameSheetCommand({ gameId, language: 'fr' }),
    )

    expect(gameRepository.findById).toHaveBeenCalledWith(gameId)
    expect(gameSheetGenerator.generate).toHaveBeenCalledWith(game, 'fr')
    expect(result).toBe(sheet)
  })

  it('propagates GAME_NOT_FOUND without calling the model', async () => {
    gameRepository.findById.mockRejectedValue(
      new NotFoundError('Game not found', { code: ErrorCode.GAME_NOT_FOUND }),
    )

    await expect(
      handler.execute(new GenerateGameSheetCommand({ gameId, language: 'fr' })),
    ).rejects.toMatchObject({ code: ErrorCode.GAME_NOT_FOUND })
    expect(gameSheetGenerator.generate).not.toHaveBeenCalled()
  })

  it('rejects an invalid game id or language', async () => {
    const error = await handler
      .execute(
        new GenerateGameSheetCommand({ gameId: 'nope', language: 'french' }),
      )
      .catch((e) => e)

    expect(error).toBeInstanceOf(CQRSValidationException)
    expect(error.fields).toEqual([
      { field: 'gameId', constraint: 'isUuid' },
      { field: 'language', constraint: 'isISO6391' },
    ])
    expect(gameRepository.findById).not.toHaveBeenCalled()
  })
})
