import { Injectable } from '@nestjs/common'
import { TransactionHost } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import { ConflictError } from '@/shared/errors'
import type { CatalogEntry, GameCategory, UserGameStatus } from '@/shared/types'
import type { PrismaService } from '../prisma.service'
import { rethrowPrismaError } from '../prisma-errors'

@Injectable()
export class UserGameRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {}

  /**
   * Idempotent. A game has only one status per user:
   * - `owned`: adds the game, or moves it from the wishlist to the library;
   * - `wishlist`: adds the game, but throws a conflict (409) if it is already owned.
   */
  async add(
    userId: string,
    gameId: string,
    status: UserGameStatus,
  ): Promise<void> {
    try {
      const row = await this.txHost.tx.userGame.upsert({
        where: { userId_gameId: { userId, gameId } },
        create: { userId, gameId, status: toDbStatus(status) },
        update: status === 'owned' ? { status: 'OWNED' } : {},
        select: { status: true },
      })
      if (status === 'wishlist' && row.status === 'OWNED') {
        throw new ConflictError('Game is already in the library')
      }
    } catch (error) {
      if (error instanceof ConflictError) throw error
      rethrowPrismaError(error)
    }
  }

  /** Idempotent: a game absent from this list is ignored (the other list is never touched). */
  async remove(
    userId: string,
    gameId: string,
    status: UserGameStatus,
  ): Promise<void> {
    await this.txHost.tx.userGame.deleteMany({
      where: { userId, gameId, status: toDbStatus(status) },
    })
  }

  /** Number of (non-deleted) games in a list. */
  count(userId: string, status: UserGameStatus): Promise<number> {
    return this.txHost.tx.userGame.count({
      where: { userId, status: toDbStatus(status), game: { deletedAt: null } },
    })
  }

  /** Games of a list, most recently added first; name in `language` if known. */
  async listByUser(
    userId: string,
    language: string,
    status: UserGameStatus,
  ): Promise<CatalogEntry[]> {
    const rows = await this.txHost.tx.userGame.findMany({
      where: { userId, status: toDbStatus(status), game: { deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        game: {
          select: {
            id: true,
            name: true,
            localizedNames: true,
            year: true,
            categories: true,
            imageUrl: true,
          },
        },
      },
    })
    return rows.map(({ createdAt, game }) => {
      const localizedNames = game.localizedNames as Record<
        string,
        string
      > | null
      return {
        id: game.id,
        name: localizedNames?.[language] || game.name,
        year: game.year,
        imageUrl: game.imageUrl,
        categories: game.categories.map(
          (category) => category.toLowerCase() as GameCategory,
        ),
        addedAt: createdAt,
      }
    })
  }
}

function toDbStatus(status: UserGameStatus): 'OWNED' | 'WISHLIST' {
  return status === 'owned' ? 'OWNED' : 'WISHLIST'
}
