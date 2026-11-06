import { Injectable } from '@nestjs/common'
import { TransactionHost } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import type { User, UserCredentials } from '@/shared/types'
import { toUser, toUserCredentials } from '../mappers'
import type { PrismaService } from '../prisma.service'
import { rethrowPrismaError } from '../prisma-errors'

export type CreateUserParams = {
  /** Déjà normalisés en minuscules. */
  email: string
  username: string
  passwordHash: string
}

@Injectable()
export class UserRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {}

  async create(params: CreateUserParams): Promise<User> {
    try {
      const record = await this.txHost.tx.user.create({ data: params })
      return toUser(record)
    } catch (error) {
      return rethrowPrismaError(error)
    }
  }

  async existsByEmail(email: string): Promise<boolean> {
    const record = await this.txHost.tx.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true },
    })
    return record !== null
  }

  async existsByUsername(username: string): Promise<boolean> {
    const record = await this.txHost.tx.user.findFirst({
      where: { username, deletedAt: null },
      select: { id: true },
    })
    return record !== null
  }

  async findCredentialsByUsername(
    username: string,
  ): Promise<UserCredentials | null> {
    const record = await this.txHost.tx.user.findFirst({
      where: { username, deletedAt: null },
    })
    return record ? toUserCredentials(record) : null
  }

  async findById(id: string): Promise<User | null> {
    const record = await this.txHost.tx.user.findFirst({
      where: { id, deletedAt: null },
    })
    return record ? toUser(record) : null
  }
}
