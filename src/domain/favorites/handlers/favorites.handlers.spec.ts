import { Test } from '@nestjs/testing'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import {
  GameRepository,
  UserFavoriteRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { ErrorCode, NotFoundError } from '@/shared/errors'
import {
  AddGameToFavoritesCommand,
  RemoveGameFromFavoritesCommand,
} from '../commands'
import { ListFavoritesQuery } from '../queries'
import { AddGameToFavoritesHandler } from './add-game-to-favorites.handler'
import { ListFavoritesHandler } from './list-favorites.handler'
import { RemoveGameFromFavoritesHandler } from './remove-game-from-favorites.handler'

const userId = '0195d1a2-0000-7000-8000-000000000001'
const gameId = '0195d1a2-0000-7000-8000-000000000002'

describe('favorites handlers', () => {
  const gameRepository = { findById: vi.fn() }
  const userFavoriteRepository = {
    add: vi.fn(),
    remove: vi.fn(),
    listByUser: vi.fn(),
  }
  let add: AddGameToFavoritesHandler
  let remove: RemoveGameFromFavoritesHandler
  let list: ListFavoritesHandler

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AddGameToFavoritesHandler,
        RemoveGameFromFavoritesHandler,
        ListFavoritesHandler,
        { provide: GameRepository, useValue: gameRepository },
        { provide: UserFavoriteRepository, useValue: userFavoriteRepository },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile()
    add = moduleRef.get(AddGameToFavoritesHandler)
    remove = moduleRef.get(RemoveGameFromFavoritesHandler)
    list = moduleRef.get(ListFavoritesHandler)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('adds an existing game to the favorites', async () => {
    gameRepository.findById.mockResolvedValue({ id: gameId })

    await add.execute(new AddGameToFavoritesCommand({ userId, gameId }))

    expect(userFavoriteRepository.add).toHaveBeenCalledWith(userId, gameId)
  })

  it('does not add an unknown game', async () => {
    gameRepository.findById.mockRejectedValue(
      new NotFoundError('Game not found', { code: ErrorCode.GAME_NOT_FOUND }),
    )

    await expect(
      add.execute(new AddGameToFavoritesCommand({ userId, gameId })),
    ).rejects.toBeInstanceOf(NotFoundError)
    expect(userFavoriteRepository.add).not.toHaveBeenCalled()
  })

  it('rejects an invalid game id', async () => {
    await expect(
      add.execute(new AddGameToFavoritesCommand({ userId, gameId: 'nope' })),
    ).rejects.toBeDefined()
    expect(userFavoriteRepository.add).not.toHaveBeenCalled()
  })

  it('removes a game from the favorites', async () => {
    await remove.execute(new RemoveGameFromFavoritesCommand({ userId, gameId }))

    expect(userFavoriteRepository.remove).toHaveBeenCalledWith(userId, gameId)
  })

  it('lists the favorites in the requested language', async () => {
    const entries = [{ id: gameId, name: 'Catan' }]
    userFavoriteRepository.listByUser.mockResolvedValue(entries)

    const result = await list.execute(
      new ListFavoritesQuery({ userId, language: 'fr' }),
    )

    expect(result).toBe(entries)
    expect(userFavoriteRepository.listByUser).toHaveBeenCalledWith(userId, 'fr')
  })
})
