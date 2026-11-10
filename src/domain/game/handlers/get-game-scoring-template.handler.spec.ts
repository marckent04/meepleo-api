import { Test } from '@nestjs/testing'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import { GameRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { ErrorCode, NotFoundError } from '@/shared/errors'
import { DEFAULT_SCORING_TEMPLATE, type ScoringTemplate } from '@/shared/types'
import { GetGameScoringTemplateQuery } from '../queries'
import { GetGameScoringTemplateHandler } from './get-game-scoring-template.handler'

const gameId = '0195d1a2-0000-7000-8000-000000000001'

describe('GetGameScoringTemplateHandler', () => {
  const gameRepository = { findScoringTemplate: vi.fn() }
  let handler: GetGameScoringTemplateHandler

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        GetGameScoringTemplateHandler,
        { provide: GameRepository, useValue: gameRepository },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile()
    handler = moduleRef.get(GetGameScoringTemplateHandler)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns the game template in the requested language', async () => {
    const template: ScoringTemplate = {
      ...DEFAULT_SCORING_TEMPLATE,
      outcome: 'lowest',
      rounds: { count: null },
    }
    gameRepository.findScoringTemplate.mockResolvedValue(template)

    await expect(
      handler.execute(
        new GetGameScoringTemplateQuery({ gameId, language: 'fr' }),
      ),
    ).resolves.toBe(template)
    expect(gameRepository.findScoringTemplate).toHaveBeenCalledWith(
      gameId,
      'fr',
    )
  })

  it('falls back to the default template', async () => {
    gameRepository.findScoringTemplate.mockResolvedValue(null)

    await expect(
      handler.execute(
        new GetGameScoringTemplateQuery({ gameId, language: 'en' }),
      ),
    ).resolves.toEqual(DEFAULT_SCORING_TEMPLATE)
  })

  it('propagates an unknown game', async () => {
    gameRepository.findScoringTemplate.mockRejectedValue(
      new NotFoundError('Game not found', { code: ErrorCode.GAME_NOT_FOUND }),
    )

    await expect(
      handler.execute(
        new GetGameScoringTemplateQuery({ gameId, language: 'fr' }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})
