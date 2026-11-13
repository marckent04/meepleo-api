import { createTransactionHostMock } from '@/__tests__/utils/prisma.mock'
import { ConflictError } from '@/shared/errors'
import { UserGameRepository } from './user-game.repository'

const t1 = new Date('2026-11-12T10:00:00.000Z')
const t2 = new Date('2026-11-12T11:00:00.000Z')

function row(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: t1,
    updatedAt: t1,
    deletedAt: null,
    revision: BigInt(3),
    game: {
      id: 'g1',
      name: 'Catan',
      localizedNames: { fr: 'Les Colons de Catane' },
      year: 1995,
      categories: ['STRATEGY'],
      imageUrl: null,
    },
    ...overrides,
  }
}

function setup() {
  const { host, tx } = createTransactionHostMock({
    userGame: {
      findUnique: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn().mockResolvedValue(row()),
      upsert: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
  })
  return { repository: new UserGameRepository(host), model: tx.userGame }
}

describe('UserGameRepository', () => {
  it('add owned creates the entry', async () => {
    const { repository, model } = setup()

    await repository.add('u1', 'g1', 'owned')

    expect(model.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_gameId: { userId: 'u1', gameId: 'g1' } },
        create: expect.objectContaining({ status: 'OWNED' }),
        update: expect.objectContaining({ status: 'OWNED', deletedAt: null }),
      }),
    )
  })

  it('add owned moves a wishlisted game to the library', async () => {
    const { repository, model } = setup()
    model.findUnique.mockResolvedValue({
      status: 'WISHLIST',
      deletedAt: null,
      updatedAt: new Date(0),
    })

    await repository.add('u1', 'g1', 'owned')

    expect(model.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: 'OWNED' }),
      }),
    )
  })

  it('add wishlist throws a conflict when the game is already owned', async () => {
    const { repository, model } = setup()
    model.findUnique.mockResolvedValue({
      status: 'OWNED',
      deletedAt: null,
      updatedAt: new Date(0),
    })

    await expect(repository.add('u1', 'g1', 'wishlist')).rejects.toBeInstanceOf(
      ConflictError,
    )
    expect(model.upsert).not.toHaveBeenCalled()
  })

  it('add wishlist revives a game removed from the library', async () => {
    const { repository, model } = setup()
    model.findUnique.mockResolvedValue({
      status: 'OWNED',
      deletedAt: new Date(0),
      updatedAt: new Date(0),
    })

    await repository.add('u1', 'g1', 'wishlist')

    expect(model.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: 'WISHLIST',
          deletedAt: null,
        }),
      }),
    )
  })

  it('remove soft deletes only the live entry with the given status', async () => {
    const { repository, model } = setup()

    await repository.remove('u1', 'g1', 'wishlist')

    expect(model.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        gameId: 'g1',
        status: 'WISHLIST',
        deletedAt: null,
      },
      data: { deletedAt: expect.any(Date), updatedAt: expect.any(Date) },
    })
  })

  it('listByUser maps rows, preferring the localized name', async () => {
    const { repository, model } = setup()
    model.findMany.mockResolvedValue([
      row(),
      row({
        game: {
          id: 'g2',
          name: 'Dixit',
          localizedNames: null,
          year: null,
          categories: [],
          imageUrl: null,
        },
      }),
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
      addedAt: t1,
      updatedAt: t1,
      deletedAt: null,
      revision: 3,
    })
    expect(model.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'u1',
          status: 'OWNED',
          game: { deletedAt: null },
          deletedAt: null,
        },
      }),
    )
  })

  it('listByUser with updatedSince includes tombstones', async () => {
    const { repository, model } = setup()
    model.findMany.mockResolvedValue([])

    await repository.listByUser('u1', 'fr', 'owned', t1)

    expect(model.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'u1',
          status: 'OWNED',
          game: { deletedAt: null },
          updatedAt: { gt: t1 },
        },
      }),
    )
  })

  describe('applyLww', () => {
    const write = {
      gameId: 'g1',
      createdAt: t1,
      updatedAt: t2,
      deletedAt: null,
    }

    it('ignores an older write and reports a conflict', async () => {
      const { repository, model } = setup()
      model.findUnique.mockResolvedValue({
        status: 'OWNED',
        deletedAt: null,
        updatedAt: new Date('2026-11-12T12:00:00.000Z'),
      })

      const result = await repository.applyLww('u1', 'owned', write)

      expect(result.status).toBe('conflict')
      expect(model.upsert).not.toHaveBeenCalled()
    })

    it('replays an equal write without changing anything', async () => {
      const { repository, model } = setup()
      model.findUnique.mockResolvedValue({
        status: 'OWNED',
        deletedAt: null,
        updatedAt: t2,
      })

      const result = await repository.applyLww('u1', 'owned', write)

      expect(result.status).toBe('ok')
      expect(model.upsert).not.toHaveBeenCalled()
    })

    it('applies a tombstone', async () => {
      const { repository, model } = setup()

      await repository.applyLww('u1', 'owned', { ...write, deletedAt: t2 })

      expect(model.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { updatedAt: t2, deletedAt: t2 },
        }),
      )
    })

    it('ignores the removal of a wishlist game that is in the library', async () => {
      const { repository, model } = setup()
      model.findUnique.mockResolvedValue({
        status: 'OWNED',
        deletedAt: null,
        updatedAt: t1,
      })

      const result = await repository.applyLww('u1', 'wishlist', {
        ...write,
        deletedAt: t2,
      })

      expect(result).toEqual({ status: 'ok', entity: null })
      expect(model.upsert).not.toHaveBeenCalled()
    })
  })
})
