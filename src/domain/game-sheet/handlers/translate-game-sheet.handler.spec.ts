import { Test } from '@nestjs/testing'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import { GameSheetTranslator } from '@/infrastructure/adapters/anthropic'
import { GameRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { CQRSValidationException, NotFoundError } from '@/shared/errors'
import type { GameSheet, GameSheetTranslation } from '@/shared/types'
import { TranslateGameSheetCommand } from '../commands'
import { TranslateGameSheetHandler } from './translate-game-sheet.handler'

const gameId = '0195d1a2-0000-7000-8000-000000000001'
const command = new TranslateGameSheetCommand({
  gameId,
  sourceLanguage: 'fr',
  targetLanguage: 'en',
})

describe('TranslateGameSheetHandler', () => {
  let handler: TranslateGameSheetHandler
  const gameRepository = { findSheet: vi.fn() }
  const gameSheetTranslator = { translate: vi.fn() }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TranslateGameSheetHandler,
        { provide: GameRepository, useValue: gameRepository },
        { provide: GameSheetTranslator, useValue: gameSheetTranslator },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile()
    handler = moduleRef.get(TranslateGameSheetHandler)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('translates the stored sheet of the source language', async () => {
    const sheet = { gameId, language: 'fr' } as GameSheet
    const translation = { gameId } as GameSheetTranslation
    gameRepository.findSheet.mockResolvedValue(sheet)
    gameSheetTranslator.translate.mockResolvedValue(translation)

    const result = await handler.execute(command)

    expect(gameRepository.findSheet).toHaveBeenCalledWith(gameId, 'fr')
    expect(gameSheetTranslator.translate).toHaveBeenCalledWith(sheet, 'en')
    expect(result).toBe(translation)
  })

  it('fails when the source sheet does not exist', async () => {
    gameRepository.findSheet.mockResolvedValue(null)

    await expect(handler.execute(command)).rejects.toBeInstanceOf(NotFoundError)
    expect(gameSheetTranslator.translate).not.toHaveBeenCalled()
  })

  it('rejects invalid languages', async () => {
    await expect(
      handler.execute(
        new TranslateGameSheetCommand({
          gameId,
          sourceLanguage: 'french',
          targetLanguage: 'en',
        }),
      ),
    ).rejects.toBeInstanceOf(CQRSValidationException)
  })
})
