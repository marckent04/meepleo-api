import { createTransactionHostMock } from '@/__tests__/utils/prisma.mock'
import { GAME_SEARCH_RESULT_SELECT } from '../mappers'
import { GameBarcodeRepository } from './game-barcode.repository'

const code = '3421272109111'
const gameId = '0195d1a2-0000-7000-8000-000000000001'

describe('GameBarcodeRepository', () => {
  it('finds the non-deleted game of a barcode, named in the language', async () => {
    const { host, tx } = createTransactionHostMock({
      gameBarcode: {
        findFirst: vi.fn().mockResolvedValue({
          game: {
            id: gameId,
            name: 'CATAN',
            localizedNames: { fr: 'Catane' },
            year: 1995,
            categories: ['STRATEGY'],
          },
        }),
      },
    })

    const game = await new GameBarcodeRepository(host).findGameByCode(
      code,
      'fr',
    )

    expect(tx.gameBarcode.findFirst).toHaveBeenCalledWith({
      where: { code, game: { deletedAt: null } },
      select: { game: { select: GAME_SEARCH_RESULT_SELECT } },
    })
    expect(game).toEqual({
      id: gameId,
      name: 'Catane',
      year: 1995,
      categories: ['strategy'],
    })
  })

  it('returns null for an unknown barcode', async () => {
    const { host } = createTransactionHostMock({
      gameBarcode: { findFirst: vi.fn().mockResolvedValue(null) },
    })

    await expect(
      new GameBarcodeRepository(host).findGameByCode(code, 'fr'),
    ).resolves.toBeNull()
  })

  it('links a barcode to a game, ignoring an existing link', async () => {
    const { host, tx } = createTransactionHostMock({
      gameBarcode: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    })

    await new GameBarcodeRepository(host).attach(code, gameId)

    expect(tx.gameBarcode.createMany).toHaveBeenCalledWith({
      data: [{ code, gameId }],
      skipDuplicates: true,
    })
  })
})
