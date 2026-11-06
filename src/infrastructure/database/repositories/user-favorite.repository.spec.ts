import { createTransactionHostMock } from '@/__tests__/utils/prisma.mock'
import { UserFavoriteRepository } from './user-favorite.repository'

function setup() {
  const { host, tx } = createTransactionHostMock({
    userFavorite: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
  })
  return {
    repository: new UserFavoriteRepository(host),
    model: tx.userFavorite,
  }
}

describe('UserFavoriteRepository', () => {
  it('add ignores duplicates', async () => {
    const { repository, model } = setup()
    await repository.add('u1', 'g1')
    expect(model.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'u1', gameId: 'g1' }],
      skipDuplicates: true,
    })
  })

  it('remove deletes only the user entry', async () => {
    const { repository, model } = setup()
    await repository.remove('u1', 'g1')
    expect(model.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', gameId: 'g1' },
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

    const result = await repository.listByUser('u1', 'fr')

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
        where: { userId: 'u1', game: { deletedAt: null } },
      }),
    )
  })
})
