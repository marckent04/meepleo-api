import { Injectable } from '@nestjs/common'
import { TransactionHost } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import { ConflictError, ErrorCode } from '@/shared/errors'
import type {
  CatalogEntry,
  GameListWrite,
  LwwResult,
  UserGameStatus,
} from '@/shared/types'
import { resolveLastWriteWins } from '@/utils/last-write-wins'
import { GAME_LIST_ENTRY_SELECT, toGameListEntry } from '../mappers'
import type { PrismaService } from '../prisma.service'
import { rethrowPrismaError } from '../prisma-errors'

/** A change of a list with the status (library / wishlist) it belongs to. */
export type UserGameChange = {
  status: UserGameStatus
  entry: CatalogEntry
}

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
   * A previously removed game is revived.
   */
  async add(
    userId: string,
    gameId: string,
    status: UserGameStatus,
  ): Promise<void> {
    const now = new Date()
    await this.applyLww(userId, status, {
      gameId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
  }

  /** Idempotent: a game absent from this list is ignored (the other list is never touched). */
  async remove(
    userId: string,
    gameId: string,
    status: UserGameStatus,
  ): Promise<void> {
    const now = new Date()
    await this.txHost.tx.userGame.updateMany({
      where: { userId, gameId, status: toDbStatus(status), deletedAt: null },
      data: { deletedAt: now, updatedAt: now },
    })
  }

  /** Number of (non-deleted) games in a list. */
  count(userId: string, status: UserGameStatus): Promise<number> {
    return this.txHost.tx.userGame.count({
      where: {
        userId,
        status: toDbStatus(status),
        deletedAt: null,
        game: { deletedAt: null },
      },
    })
  }

  /**
   * Games of a list, most recently added first; name in `language` if known.
   * Without `updatedSince` only games in the list are returned; with it,
   * everything modified after that date, removed games (tombstones) included.
   */
  async listByUser(
    userId: string,
    language: string,
    status: UserGameStatus,
    updatedSince?: Date,
  ): Promise<CatalogEntry[]> {
    const rows = await this.txHost.tx.userGame.findMany({
      where: {
        userId,
        status: toDbStatus(status),
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

  /** Changes (tombstones included) of both lists after a revision, oldest first. */
  async listChangedSince(
    userId: string,
    language: string,
    revision: number,
    take: number,
  ): Promise<UserGameChange[]> {
    const rows = await this.txHost.tx.userGame.findMany({
      where: { userId, revision: { gt: revision }, game: { deletedAt: null } },
      orderBy: { revision: 'asc' },
      take,
      select: { ...GAME_LIST_ENTRY_SELECT, status: true },
    })
    return rows.map((row) => ({
      status: row.status === 'OWNED' ? 'owned' : 'wishlist',
      entry: toGameListEntry(row, language),
    }))
  }

  /**
   * Last-write-wins write of a game in a list (offline-first). The entity is
   * null when the write does not concern this list (removing a game from the
   * wishlist while it is in the library). Adding to the wishlist a game that
   * is in the library throws a conflict (409). To call in a transaction.
   */
  async applyLww(
    userId: string,
    status: UserGameStatus,
    write: GameListWrite,
    language = 'en',
  ): Promise<LwwResult<CatalogEntry | null>> {
    const { gameId } = write
    try {
      const stored = await this.txHost.tx.userGame.findUnique({
        where: { userId_gameId: { userId, gameId } },
      })
      const dbStatus = toDbStatus(status)
      const alive = stored !== null && stored.deletedAt === null
      const decision = resolveLastWriteWins(
        write.updatedAt,
        stored?.updatedAt ?? null,
      )
      if (stored && decision !== 'apply') {
        const concerns = !alive || stored.status === dbStatus
        return {
          status: decision === 'conflict' ? 'conflict' : 'ok',
          entity: concerns ? await this.read(userId, gameId, language) : null,
        }
      }
      if (write.deletedAt !== null) {
        if (alive && stored.status !== dbStatus) {
          return { status: 'ok', entity: null }
        }
        await this.txHost.tx.userGame.upsert({
          where: { userId_gameId: { userId, gameId } },
          create: {
            userId,
            gameId,
            status: dbStatus,
            createdAt: write.createdAt,
            updatedAt: write.updatedAt,
            deletedAt: write.deletedAt,
          },
          update: { updatedAt: write.updatedAt, deletedAt: write.deletedAt },
        })
        return {
          status: 'ok',
          entity: await this.read(userId, gameId, language),
        }
      }
      if (alive && status === 'wishlist' && stored.status === 'OWNED') {
        throw new ConflictError('Game is already in the library', {
          code: ErrorCode.CONFLICT,
        })
      }
      await this.txHost.tx.userGame.upsert({
        where: { userId_gameId: { userId, gameId } },
        create: {
          userId,
          gameId,
          status: dbStatus,
          createdAt: write.createdAt,
          updatedAt: write.updatedAt,
        },
        update: {
          status: dbStatus,
          updatedAt: write.updatedAt,
          deletedAt: null,
        },
      })
      return { status: 'ok', entity: await this.read(userId, gameId, language) }
    } catch (error) {
      if (error instanceof ConflictError) throw error
      rethrowPrismaError(error, { notFound: ErrorCode.GAME_NOT_FOUND })
    }
  }

  private async read(
    userId: string,
    gameId: string,
    language: string,
  ): Promise<CatalogEntry> {
    const row = await this.txHost.tx.userGame.findUniqueOrThrow({
      where: { userId_gameId: { userId, gameId } },
      select: GAME_LIST_ENTRY_SELECT,
    })
    return toGameListEntry(row, language)
  }
}

function toDbStatus(status: UserGameStatus): 'OWNED' | 'WISHLIST' {
  return status === 'owned' ? 'OWNED' : 'WISHLIST'
}
