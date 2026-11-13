import { createTransactionHostMock } from '@/__tests__/utils/prisma.mock'
import { UserFavoriteRepository } from './user-favorite.repository'

const t1 = new Date('2026-11-12T10:00:00.000Z')
const t2 = new Date('2026-11-12T11:00:00.000Z')

function row(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: t1,
    updatedAt: t1,
    deletedAt: null,
    revision: BigInt(5),
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
    userFavorite: {
      findUnique: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn().mockResolvedValue(row()),
      upsert: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
  })
  return {
    repository: new UserFavoriteRepository(host),
    model: tx.userFavorite,
  }
}

describe('UserFavoriteRepository', () => {
  it('add creates or revives the favorite', async () => {
    const { repository, model } = setup()

    await repository.add('u1', 'g1')

    expect(model.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_gameId: { userId: 'u1', gameId: 'g1' } },
        update: expect.objectContaining({ deletedAt: null }),
      }),
    )
  })

  it('remove soft deletes only the live user entry', async () => {
    const { repository, model } = setup()

    await repository.remove('u1', 'g1')

    expect(model.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', gameId: 'g1', deletedAt: null },
      data: { deletedAt: expect.any(Date), updatedAt: expect.any(Date) },
    })
  })

  it('listByUser maps rows, preferring the localized name', async () => {
    const { repository, model } = setup()
    model.findMany.mockResolvedValue([row()])

    const [entry] = await repository.listByUser('u1', 'fr')

    expect(entry).toMatchObject({
      id: 'g1',
      name: 'Les Colons de Catane',
      categories: ['strategy'],
      addedAt: t1,
      revision: 5,
    })
    expect(model.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', game: { deletedAt: null }, deletedAt: null },
      }),
    )
  })

  it('listByUser with updatedSince includes tombstones', async () => {
    const { repository, model } = setup()
    model.findMany.mockResolvedValue([])

    await repository.listByUser('u1', 'fr', t1)

    expect(model.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'u1',
          game: { deletedAt: null },
          updatedAt: { gt: t1 },
        },
      }),
    )
  })

  it('applyLww reports a conflict for an older write', async () => {
    const { repository, model } = setup()
    model.findUnique.mockResolvedValue({ deletedAt: null, updatedAt: t2 })

    const result = await repository.applyLww('u1', {
      gameId: 'g1',
      createdAt: t1,
      updatedAt: t1,
      deletedAt: t1,
    })

    expect(result.status).toBe('conflict')
    expect(model.upsert).not.toHaveBeenCalled()
  })
})
