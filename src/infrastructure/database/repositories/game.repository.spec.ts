import { createTransactionHostMock } from '@/__tests__/utils/prisma.mock'
import { ErrorCode, NotFoundError } from '@/shared/errors'
import { Game } from '@/shared/types'
import { GameRepository } from './game.repository'

const id = '0195d1a2-0000-7000-8000-000000000001'

describe('GameRepository', () => {
  it('finds a non-deleted game and maps it to the domain model', async () => {
    const { host, tx } = createTransactionHostMock({
      game: {
        findFirst: vi.fn().mockResolvedValue({
          id,
          name: 'Dnup',
          year: 2021,
          publisher: null,
          edition: null,
          bggId: 123,
        }),
      },
    })

    const game = await new GameRepository(host).findById(id)

    expect(tx.game.findFirst).toHaveBeenCalledWith({
      where: { id, deletedAt: null },
    })
    expect(game).toEqual(new Game(id, 'Dnup', 2021, null, null, 123))
  })

  it('throws GAME_NOT_FOUND when the game does not exist', async () => {
    const { host } = createTransactionHostMock({
      game: { findFirst: vi.fn().mockResolvedValue(null) },
    })

    const error = await new GameRepository(host).findById(id).catch((e) => e)

    expect(error).toBeInstanceOf(NotFoundError)
    expect(error.code).toBe(ErrorCode.GAME_NOT_FOUND)
  })
})
