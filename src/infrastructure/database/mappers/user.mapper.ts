import type { User, UserCredentials } from '@/shared/types'
import type { User as UserRecord } from '../generated/prisma/client'

export function toUser(record: UserRecord): User {
  return {
    id: record.id,
    email: record.email,
    username: record.username,
    createdAt: record.createdAt,
  }
}

export function toUserCredentials(record: UserRecord): UserCredentials {
  return { ...toUser(record), passwordHash: record.passwordHash }
}
