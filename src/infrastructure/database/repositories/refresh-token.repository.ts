import { Injectable } from '@nestjs/common'
import { TransactionHost } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import type { PrismaService } from '../prisma.service'
import { rethrowPrismaError } from '../prisma-errors'

export type StoredRefreshToken = {
  id: string
  userId: string
  tokenHash: string
  expiresAt: Date
  revokedAt: Date | null
}

export type CreateRefreshTokenParams = {
  /** `jti` claim of the refresh token. */
  id: string
  userId: string
  tokenHash: string
  expiresAt: Date
}

@Injectable()
export class RefreshTokenRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {}

  async create(params: CreateRefreshTokenParams): Promise<void> {
    try {
      await this.txHost.tx.refreshToken.create({ data: params })
    } catch (error) {
      rethrowPrismaError(error)
    }
  }

  findById(id: string): Promise<StoredRefreshToken | null> {
    return this.txHost.tx.refreshToken.findUnique({ where: { id } })
  }

  /**
   * Revokes a token atomically. `false` if another call had
   * already revoked it (concurrent replay or stolen token).
   */
  async revoke(id: string): Promise<boolean> {
    const { count } = await this.txHost.tx.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    return count === 1
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.txHost.tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }
}
