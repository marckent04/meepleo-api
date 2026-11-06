import { Injectable } from '@nestjs/common'
import { TransactionHost } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import type { CatalogEntry, GameCategory } from '@/shared/types'
import type { PrismaService } from '../prisma.service'
import { rethrowPrismaError } from '../prisma-errors'

@Injectable()
export class UserGameRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {}

  /** Idempotent : un jeu déjà dans le catalogue est ignoré. */
  async add(userId: string, gameId: string): Promise<void> {
    try {
      await this.txHost.tx.userGame.createMany({
        data: [{ userId, gameId }],
        skipDuplicates: true,
      })
    } catch (error) {
      rethrowPrismaError(error)
    }
  }

  /** Idempotent : un jeu absent du catalogue est ignoré. */
  async remove(userId: string, gameId: string): Promise<void> {
    await this.txHost.tx.userGame.deleteMany({ where: { userId, gameId } })
  }

  /** Jeux du catalogue, derniers ajoutés d'abord ; nom dans `language` s'il est connu. */
  async listByUser(userId: string, language: string): Promise<CatalogEntry[]> {
    const rows = await this.txHost.tx.userGame.findMany({
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
