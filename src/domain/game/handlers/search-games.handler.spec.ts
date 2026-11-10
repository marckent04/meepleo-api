import { Test } from '@nestjs/testing'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import { GameRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { CQRSValidationException } from '@/shared/errors'
import type { GameSearchResult } from '@/shared/types'
import { SearchGamesQuery, type SearchGamesQueryParams } from '../queries'
import { SearchGamesHandler } from './search-games.handler'

const results: GameSearchResult[] = [
  {
    id: '0195d1a2-0000-7000-8000-000000000001',
    name: 'Catane',
    year: 1995,
    categories: ['strategy'],
    imageUrl: null,
  },
]

describe('SearchGamesHandler', () => {
  let handler: SearchGamesHandler
  const gameRepository = { search: vi.fn() }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SearchGamesHandler,
        { provide: GameRepository, useValue: gameRepository },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile()
    handler = moduleRef.get(SearchGamesHandler)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('searches the repository', async () => {
    gameRepository.search.mockResolvedValue(results)

    await expect(
      handler.execute(
        new SearchGamesQuery({ search: 'cat', language: 'fr', limit: 10 }),
      ),
    ).resolves.toBe(results)

    expect(gameRepository.search).toHaveBeenCalledWith('cat', 'fr', 10)
  })

  it.each<[string, SearchGamesQueryParams]>([
    ['a too short search', { search: 'c', language: 'fr', limit: 10 }],
    ['an invalid language', { search: 'cat', language: 'xx', limit: 10 }],
    ['a too large limit', { search: 'cat', language: 'fr', limit: 21 }],
    ['a zero limit', { search: 'cat', language: 'fr', limit: 0 }],
  ])('rejects %s', async (_label, params) => {
    const error = await handler
      .execute(new SearchGamesQuery(params))
      .catch((e) => e)

    expect(error).toBeInstanceOf(CQRSValidationException)
    expect(gameRepository.search).not.toHaveBeenCalled()
  })
})
