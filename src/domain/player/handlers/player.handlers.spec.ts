import { Test } from '@nestjs/testing'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import { PlayerRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { DeletePlayerCommand, UpsertPlayerCommand } from '../commands'
import { ListPlayersQuery } from '../queries'
import { DeletePlayerHandler } from './delete-player.handler'
import { ListPlayersHandler } from './list-players.handler'
import { UpsertPlayerHandler } from './upsert-player.handler'

const userId = '0195d1a2-0000-7000-8000-000000000001'
const id = '0195d1a2-0000-7000-8000-000000000002'
const t = new Date('2026-11-12T10:00:00.000Z')

function params(
  overrides: Partial<ConstructorParameters<typeof UpsertPlayerCommand>[0]> = {},
) {
  return {
    userId,
    id,
    name: 'Léa',
    color: '#E4572E',
    shape: 'circle' as const,
    isCurrentUser: false,
    createdAt: t,
    updatedAt: t,
    ...overrides,
  }
}

describe('player handlers', () => {
  const playerRepository = {
    upsertLww: vi.fn(),
    softDelete: vi.fn(),
    listByUser: vi.fn(),
  }
  let upsert: UpsertPlayerHandler
  let remove: DeletePlayerHandler
  let list: ListPlayersHandler

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        UpsertPlayerHandler,
        DeletePlayerHandler,
        ListPlayersHandler,
        { provide: PlayerRepository, useValue: playerRepository },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile()
    upsert = moduleRef.get(UpsertPlayerHandler)
    remove = moduleRef.get(DeletePlayerHandler)
    list = moduleRef.get(ListPlayersHandler)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('upserts a player with last write wins', async () => {
    playerRepository.upsertLww.mockResolvedValue({ status: 'ok', entity: {} })

    await upsert.execute(new UpsertPlayerCommand(params()))

    expect(playerRepository.upsertLww).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        id,
        name: 'Léa',
        updatedAt: t,
        deletedAt: null,
      }),
    )
  })

  it('brings an updatedAt in the future back to the reception time', async () => {
    playerRepository.upsertLww.mockResolvedValue({ status: 'ok', entity: {} })
    const future = new Date(Date.now() + 24 * 3600 * 1000)

    await upsert.execute(new UpsertPlayerCommand(params({ updatedAt: future })))

    const [, write] = playerRepository.upsertLww.mock.calls[0]
    expect(write.updatedAt.getTime()).toBeLessThan(future.getTime())
  })

  it.each([{ name: '' }, { color: 'red' }])(
    'rejects an invalid player %j',
    async (overrides) => {
      await expect(
        upsert.execute(new UpsertPlayerCommand(params(overrides))),
      ).rejects.toMatchObject({ statusCode: 400 })
      expect(playerRepository.upsertLww).not.toHaveBeenCalled()
    },
  )

  it('soft deletes a player', async () => {
    await remove.execute(new DeletePlayerCommand({ userId, id }))
    expect(playerRepository.softDelete).toHaveBeenCalledWith(
      userId,
      id,
      expect.any(Date),
    )
  })

  it('lists the players modified since a date', async () => {
    playerRepository.listByUser.mockResolvedValue([])

    await list.execute(new ListPlayersQuery({ userId, updatedSince: t }))

    expect(playerRepository.listByUser).toHaveBeenCalledWith(userId, t)
  })
})
