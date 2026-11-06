import { Injectable } from '@nestjs/common'
import { TransactionHost } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import type { FavoriteEntry, GameCategory } from '@/shared/types'
import type { PrismaService } from '../prisma.service'
import { rethrowPrismaError } from '../prisma-errors'

@Injectable()
export class UserFavoriteRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {}

  /** Idempotent: a game already in favorites is ignored. */
  async add(userId: string, gameId: string): Promise<void> {
    try {
      await this.txHost.tx.userFavorite.createMany({
        data: [{ userId, gameId }],
        skipDuplicates: true,
      })
    } catch (error) {
      rethrowPrismaError(error)
    }
  }

  /** Idempotent: a game not in favorites is ignored. */
  async remove(userId: string, gameId: string): Promise<void> {
    await this.txHost.tx.userFavorite.deleteMany({ where: { userId, gameId } })
  }

  /** Favorite games, most recently added first; name in `language` when known. */
  async listByUser(userId: string, language: string): Promise<FavoriteEntry[]> {
    const rows = await this.txHost.tx.userFavorite.findMany({
      where: { userId, game: { deletedAt: null } },
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
        categories: game.categories.map(
          (category) => category.toLowerCase() as GameCategory,
        ),
        addedAt: createdAt,
      }
    })
  }
}
