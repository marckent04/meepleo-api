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
   * Idempotent. Un jeu n'a qu'un statut par utilisateur :
   * - `owned` : ajoute le jeu, ou le fait passer de la liste de souhaits à la bibliothèque ;
   * - `wishlist` : ajoute le jeu, mais lève un conflit (409) s'il est déjà possédé.
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

  /** Idempotent : un jeu absent de cette liste est ignoré (l'autre liste n'est jamais touchée). */
  async remove(
    userId: string,
    gameId: string,
    status: UserGameStatus,
  ): Promise<void> {
    await this.txHost.tx.userGame.deleteMany({
      where: { userId, gameId, status: toDbStatus(status) },
    })
  }

  /** Jeux d'une liste, derniers ajoutés d'abord ; nom dans `language` s'il est connu. */
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

function toDbStatus(status: UserGameStatus): 'OWNED' | 'WISHLIST' {
  return status === 'owned' ? 'OWNED' : 'WISHLIST'
}
