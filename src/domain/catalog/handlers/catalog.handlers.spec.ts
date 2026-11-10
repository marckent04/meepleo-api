import { EventBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import {
  GameRepository,
  UserGameRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { ErrorCode, NotFoundError } from '@/shared/errors'
import {
  AddGameToCatalogCommand,
  RemoveGameFromCatalogCommand,
} from '../commands'
import { GameAddedToCatalogEvent } from '../events'
import { ListCatalogQuery } from '../queries'
import { AddGameToCatalogHandler } from './add-game-to-catalog.handler'
import { ListCatalogHandler } from './list-catalog.handler'
import { RemoveGameFromCatalogHandler } from './remove-game-from-catalog.handler'

const userId = '0195d1a2-0000-7000-8000-000000000001'
const gameId = '0195d1a2-0000-7000-8000-000000000002'
const language = 'fr'

describe('catalog handlers', () => {
  const eventBus = { publish: vi.fn() }
  const gameRepository = { findById: vi.fn() }
  const userGameRepository = {
    add: vi.fn(),
    remove: vi.fn(),
    listByUser: vi.fn(),
  }
  let add: AddGameToCatalogHandler
  let remove: RemoveGameFromCatalogHandler
  let list: ListCatalogHandler

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AddGameToCatalogHandler,
        RemoveGameFromCatalogHandler,
        ListCatalogHandler,
        { provide: EventBus, useValue: eventBus },
        { provide: GameRepository, useValue: gameRepository },
        { provide: UserGameRepository, useValue: userGameRepository },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile()
    add = moduleRef.get(AddGameToCatalogHandler)
    remove = moduleRef.get(RemoveGameFromCatalogHandler)
    list = moduleRef.get(ListCatalogHandler)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('adds an existing game to the catalog', async () => {
    gameRepository.findById.mockResolvedValue({ id: gameId })

    await add.execute(new AddGameToCatalogCommand({ userId, gameId, language }))

    expect(userGameRepository.add).toHaveBeenCalledWith(userId, gameId, 'owned')
    expect(eventBus.publish).toHaveBeenCalledWith(
      new GameAddedToCatalogEvent(userId, gameId, language),
    )
  })

  it('does not add an unknown game', async () => {
    gameRepository.findById.mockRejectedValue(
      new NotFoundError('Game not found', { code: ErrorCode.GAME_NOT_FOUND }),
    )

    await expect(
      add.execute(new AddGameToCatalogCommand({ userId, gameId, language })),
    ).rejects.toBeInstanceOf(NotFoundError)
    expect(userGameRepository.add).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('rejects an invalid game id', async () => {
    await expect(
      add.execute(
        new AddGameToCatalogCommand({
          userId,
          gameId: 'nope',
          language,
        }),
      ),
    ).rejects.toBeDefined()
    expect(userGameRepository.add).not.toHaveBeenCalled()
  })

  it('removes a game from the catalog', async () => {
    await remove.execute(new RemoveGameFromCatalogCommand({ userId, gameId }))

    expect(userGameRepository.remove).toHaveBeenCalledWith(
      userId,
      gameId,
      'owned',
    )
  })

  it('lists the catalog in the requested language', async () => {
    const entries = [{ id: gameId, name: 'Catan' }]
    userGameRepository.listByUser.mockResolvedValue(entries)

    const result = await list.execute(
      new ListCatalogQuery({ userId, language: 'fr' }),
    )

    expect(result).toBe(entries)
    expect(userGameRepository.listByUser).toHaveBeenCalledWith(
      userId,
      'fr',
      'owned',
    )
  })
})
