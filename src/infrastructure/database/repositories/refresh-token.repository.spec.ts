import { createTransactionHostMock } from '@/__tests__/utils/prisma.mock'
import { RefreshTokenRepository } from './refresh-token.repository'

function setup() {
  const { host, tx } = createTransactionHostMock({
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  })
  return {
    repository: new RefreshTokenRepository(host),
    model: tx.refreshToken,
  }
}

describe('RefreshTokenRepository', () => {
  it('revoke returns true when the token was still active', async () => {
    const { repository, model } = setup()
    model.updateMany.mockResolvedValue({ count: 1 })
    expect(await repository.revoke('t1')).toBe(true)
    expect(model.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't1', revokedAt: null } }),
    )
  })

  it('revoke returns false when the token was already revoked', async () => {
    const { repository, model } = setup()
    model.updateMany.mockResolvedValue({ count: 0 })
    expect(await repository.revoke('t1')).toBe(false)
  })

  it('revokes every active token of a user', async () => {
    const { repository, model } = setup()
    model.updateMany.mockResolvedValue({ count: 3 })
    await repository.revokeAllForUser('u1')
    expect(model.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }),
    )
  })
})
