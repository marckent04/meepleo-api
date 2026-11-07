import { createTransactionHostMock } from '@/__tests__/utils/prisma.mock'
import { ConflictError } from '@/shared/errors'
import { UserGameRepository } from './user-game.repository'

function setup() {
  const { host, tx } = createTransactionHostMock({
    userGame: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
  })
  return { repository: new UserGameRepository(host), model: tx.userGame }
}

describe('UserGameRepository', () => {
  it('add owned upserts the entry and moves a wishlisted game to the library', async () => {
    const { repository, model } = setup()
    model.upsert.mockResolvedValue({ status: 'OWNED' })

    await repository.add('u1', 'g1', 'owned')

    expect(model.upsert).toHaveBeenCalledWith({
      where: { userId_gameId: { userId: 'u1', gameId: 'g1' } },
      create: { userId: 'u1', gameId: 'g1', status: 'OWNED' },
      update: { status: 'OWNED' },
      select: { status: true },
    })
  })

  it('add wishlist never changes an existing entry', async () => {
    const { repository, model } = setup()
    model.upsert.mockResolvedValue({ status: 'WISHLIST' })

    await repository.add('u1', 'g1', 'wishlist')

    expect(model.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { userId: 'u1', gameId: 'g1', status: 'WISHLIST' },
        update: {},
      }),
    )
  })

  it('add wishlist throws a conflict when the game is already owned', async () => {
    const { repository, model } = setup()
    model.upsert.mockResolvedValue({ status: 'OWNED' })

    await expect(repository.add('u1', 'g1', 'wishlist')).rejects.toBeInstanceOf(
      ConflictError,
    )
  })

  it('remove deletes only the entry with the given status', async () => {
    const { repository, model } = setup()
    await repository.remove('u1', 'g1', 'wishlist')
    expect(model.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', gameId: 'g1', status: 'WISHLIST' },
    })
  })

  it('listByUser maps rows, preferring the localized name', async () => {
    const { repository, model } = setup()
    const createdAt = new Date('2026-01-01T00:00:00.000Z')
    model.findMany.mockResolvedValue([
      {
        createdAt,
        game: {
          id: 'g1',
          name: 'Catan',
          localizedNames: { fr: 'Les Colons de Catane' },
          year: 1995,
          categories: ['STRATEGY'],
        },
      },
      {
        createdAt,
        game: {
          id: 'g2',
          name: 'Dixit',
          localizedNames: null,
          year: null,
          categories: [],
        },
      },
    ])

    const result = await repository.listByUser('u1', 'fr', 'owned')

    expect(result.map((entry) => entry.name)).toEqual([
      'Les Colons de Catane',
      'Dixit',
    ])
    expect(result[0]).toMatchObject({
      id: 'g1',
      year: 1995,
      categories: ['strategy'],
      addedAt: createdAt,
    })
    expect(model.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', status: 'OWNED', game: { deletedAt: null } },
      }),
    )
  })
})
