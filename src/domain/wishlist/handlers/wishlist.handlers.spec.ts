import { EventBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import {
  GameRepository,
  UserGameRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { ConflictError, ErrorCode, NotFoundError } from '@/shared/errors'
import {
  AddGameToWishlistCommand,
  RemoveGameFromWishlistCommand,
} from '../commands'
import { GameAddedToWishlistEvent } from '../events'
import { ListWishlistQuery } from '../queries'
import { AddGameToWishlistHandler } from './add-game-to-wishlist.handler'
import { ListWishlistHandler } from './list-wishlist.handler'
import { RemoveGameFromWishlistHandler } from './remove-game-from-wishlist.handler'

const userId = '0195d1a2-0000-7000-8000-000000000001'
const gameId = '0195d1a2-0000-7000-8000-000000000002'
const language = 'fr'

describe('wishlist handlers', () => {
  const eventBus = { publish: vi.fn() }
  const gameRepository = { findById: vi.fn() }
  const userGameRepository = {
    add: vi.fn(),
    remove: vi.fn(),
    listByUser: vi.fn(),
  }
  let add: AddGameToWishlistHandler
  let remove: RemoveGameFromWishlistHandler
  let list: ListWishlistHandler

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AddGameToWishlistHandler,
        RemoveGameFromWishlistHandler,
        ListWishlistHandler,
        { provide: EventBus, useValue: eventBus },
        { provide: GameRepository, useValue: gameRepository },
        { provide: UserGameRepository, useValue: userGameRepository },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile()
    add = moduleRef.get(AddGameToWishlistHandler)
    remove = moduleRef.get(RemoveGameFromWishlistHandler)
    list = moduleRef.get(ListWishlistHandler)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('adds an existing game to the wishlist', async () => {
    gameRepository.findById.mockResolvedValue({ id: gameId })

    await add.execute(
      new AddGameToWishlistCommand({ userId, gameId, language }),
    )

    expect(userGameRepository.add).toHaveBeenCalledWith(
      userId,
      gameId,
      'wishlist',
    )
    expect(eventBus.publish).toHaveBeenCalledWith(
      new GameAddedToWishlistEvent(userId, gameId, language),
    )
  })

  it('does not add an unknown game', async () => {
    gameRepository.findById.mockRejectedValue(
      new NotFoundError('Game not found', { code: ErrorCode.GAME_NOT_FOUND }),
    )

    await expect(
      add.execute(new AddGameToWishlistCommand({ userId, gameId, language })),
    ).rejects.toBeInstanceOf(NotFoundError)
    expect(userGameRepository.add).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('does not prepare the sheet of an owned game', async () => {
    gameRepository.findById.mockResolvedValue({ id: gameId })
    userGameRepository.add.mockRejectedValue(
      new ConflictError('Game is already in the library'),
    )

    await expect(
      add.execute(new AddGameToWishlistCommand({ userId, gameId, language })),
    ).rejects.toBeInstanceOf(ConflictError)
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('rejects an invalid game id', async () => {
    await expect(
      add.execute(
        new AddGameToWishlistCommand({
          userId,
          gameId: 'nope',
          language,
        }),
      ),
    ).rejects.toBeDefined()
    expect(userGameRepository.add).not.toHaveBeenCalled()
  })

  it('removes a game from the wishlist', async () => {
    await remove.execute(new RemoveGameFromWishlistCommand({ userId, gameId }))

    expect(userGameRepository.remove).toHaveBeenCalledWith(
      userId,
      gameId,
      'wishlist',
    )
  })

  it('lists the wishlist in the requested language', async () => {
    const entries = [{ id: gameId, name: 'Catan' }]
    userGameRepository.listByUser.mockResolvedValue(entries)

    const result = await list.execute(
      new ListWishlistQuery({ userId, language: 'fr' }),
    )

    expect(result).toBe(entries)
    expect(userGameRepository.listByUser).toHaveBeenCalledWith(
      userId,
      'fr',
      'wishlist',
      undefined,
    )
  })
})
