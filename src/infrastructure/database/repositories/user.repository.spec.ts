import { createTransactionHostMock } from '@/__tests__/utils/prisma.mock'
import { UserRepository } from './user.repository'

const record = {
  id: 'u1',
  email: 'ada@example.com',
  username: 'ada',
  passwordHash: 'hash',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
}

function setup() {
  const { host, tx } = createTransactionHostMock({
    user: { create: vi.fn(), findFirst: vi.fn() },
  })
  return { repository: new UserRepository(host), user: tx.user }
}

describe('UserRepository', () => {
  it('creates a user without exposing the hash', async () => {
    const { repository, user } = setup()
    user.create.mockResolvedValue(record)
    const created = await repository.create({
      email: 'ada@example.com',
      username: 'ada',
      passwordHash: 'hash',
    })
    expect(created).not.toHaveProperty('passwordHash')
    expect(created.username).toBe('ada')
  })

  it('only looks up users that are not deleted', async () => {
    const { repository, user } = setup()
    user.findFirst.mockResolvedValue(null)
    expect(await repository.existsByEmail('x@example.com')).toBe(false)
    expect(user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'x@example.com', deletedAt: null },
      }),
    )
  })

  it('returns the credentials for a username', async () => {
    const { repository, user } = setup()
    user.findFirst.mockResolvedValue(record)
    const credentials = await repository.findCredentialsByUsername('ada')
    expect(credentials?.passwordHash).toBe('hash')
  })
})
