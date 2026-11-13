import { Injectable } from '@nestjs/common'
import { TransactionHost } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import { ErrorCode } from '@/shared/errors'
import type { FavoriteEntry, GameListWrite, LwwResult } from '@/shared/types'
import { resolveLastWriteWins } from '@/utils/last-write-wins'
import { GAME_LIST_ENTRY_SELECT, toGameListEntry } from '../mappers'
import type { PrismaService } from '../prisma.service'
import { rethrowPrismaError } from '../prisma-errors'

@Injectable()
export class UserFavoriteRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {}

  /** Idempotent: a game already in favorites is ignored; a removed one is revived. */
  async add(userId: string, gameId: string): Promise<void> {
    const now = new Date()
    await this.applyLww(userId, {
      gameId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
  }

  /** Idempotent: a game not in favorites is ignored. */
  async remove(userId: string, gameId: string): Promise<void> {
    const now = new Date()
    await this.txHost.tx.userFavorite.updateMany({
      where: { userId, gameId, deletedAt: null },
      data: { deletedAt: now, updatedAt: now },
    })
  }

  /** Number of (non-deleted) favorite games. */
  count(userId: string): Promise<number> {
    return this.txHost.tx.userFavorite.count({
      where: { userId, deletedAt: null, game: { deletedAt: null } },
    })
  }

  /**
   * Favorite games, most recently added first; name in `language` when known.
   * Without `updatedSince` only current favorites are returned; with it,
   * everything modified after that date, tombstones included.
   */
  async listByUser(
    userId: string,
    language: string,
    updatedSince?: Date,
  ): Promise<FavoriteEntry[]> {
    const rows = await this.txHost.tx.userFavorite.findMany({
      where: {
        userId,
        game: { deletedAt: null },
        ...(updatedSince
          ? { updatedAt: { gt: updatedSince } }
          : { deletedAt: null }),
      },
      orderBy: { createdAt: 'desc' },
      select: GAME_LIST_ENTRY_SELECT,
    })
    return rows.map((row) => toGameListEntry(row, language))
  }

  /** Changes (tombstones included) after a revision, oldest first. */
  async listChangedSince(
    userId: string,
    language: string,
    revision: number,
    take: number,
  ): Promise<FavoriteEntry[]> {
    const rows = await this.txHost.tx.userFavorite.findMany({
      where: { userId, revision: { gt: revision }, game: { deletedAt: null } },
      orderBy: { revision: 'asc' },
      take,
      select: GAME_LIST_ENTRY_SELECT,
    })
    return rows.map((row) => toGameListEntry(row, language))
  }

  /** Last-write-wins write of a favorite (offline-first). To call in a transaction. */
  async applyLww(
    userId: string,
    write: GameListWrite,
    language = 'en',
  ): Promise<LwwResult<FavoriteEntry>> {
    const { gameId } = write
    try {
      const stored = await this.txHost.tx.userFavorite.findUnique({
        where: { userId_gameId: { userId, gameId } },
      })
      const decision = resolveLastWriteWins(
        write.updatedAt,
        stored?.updatedAt ?? null,
      )
      if (stored && decision !== 'apply') {
        return {
          status: decision === 'conflict' ? 'conflict' : 'ok',
          entity: await this.read(userId, gameId, language),
        }
      }
      await this.txHost.tx.userFavorite.upsert({
        where: { userId_gameId: { userId, gameId } },
        create: {
          userId,
          gameId,
          createdAt: write.createdAt,
          updatedAt: write.updatedAt,
          deletedAt: write.deletedAt,
        },
        update: { updatedAt: write.updatedAt, deletedAt: write.deletedAt },
      })
      return { status: 'ok', entity: await this.read(userId, gameId, language) }
    } catch (error) {
      rethrowPrismaError(error, { notFound: ErrorCode.GAME_NOT_FOUND })
    }
  }

  private async read(
    userId: string,
    gameId: string,
    language: string,
  ): Promise<FavoriteEntry> {
    const row = await this.txHost.tx.userFavorite.findUniqueOrThrow({
      where: { userId_gameId: { userId, gameId } },
      select: GAME_LIST_ENTRY_SELECT,
    })
    return toGameListEntry(row, language)
  }
}
