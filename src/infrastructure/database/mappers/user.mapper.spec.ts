import type { User as UserRecord } from '../generated/prisma/client'
import { toUser, toUserCredentials } from './user.mapper'

const record: UserRecord = {
  id: '0194b0a0-0000-7000-8000-000000000001',
  email: 'ada@example.com',
  username: 'ada',
  passwordHash: '$argon2id$hash',
  createdAt: new Date('2026-11-06T10:00:00Z'),
  updatedAt: new Date('2026-11-06T10:00:00Z'),
  deletedAt: null,
}

describe('user mapper', () => {
  it('never exposes the password hash in a User', () => {
    expect(toUser(record)).toEqual({
      id: record.id,
      email: 'ada@example.com',
      username: 'ada',
      createdAt: record.createdAt,
    })
  })

  it('keeps the password hash in the credentials', () => {
    expect(toUserCredentials(record).passwordHash).toBe('$argon2id$hash')
  })
})
