import { Injectable } from '@nestjs/common'
import { TransactionHost } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import { ConflictError, ErrorCode, NotFoundError } from '@/shared/errors'
import type { LwwResult, Player, PlayerWrite } from '@/shared/types'
import { resolveLastWriteWins } from '@/utils/last-write-wins'
import { toPlayer, toPlayerShapeRecord } from '../mappers'
import type { PrismaService } from '../prisma.service'
import { rethrowPrismaError } from '../prisma-errors'

@Injectable()
export class PlayerRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {}

  /**
   * Last-write-wins upsert of a client-identified player. An id owned by
   * another user is a conflict (409) that reveals nothing about its content.
   * A tombstone (`deletedAt`) only updates the deletion state of an existing player.
   */
  async upsertLww(
    userId: string,
    write: PlayerWrite,
  ): Promise<LwwResult<Player>> {
    try {
      const stored = await this.txHost.tx.player.findUnique({
        where: { id: write.id },
      })
      if (stored && stored.userId !== userId) {
        throw new ConflictError('Player id already used', {
          code: ErrorCode.CONFLICT,
          details: { playerId: write.id },
        })
      }
      const decision = resolveLastWriteWins(
        write.updatedAt,
        stored?.updatedAt ?? null,
      )
      if (stored && decision !== 'apply') {
        return {
          status: decision === 'conflict' ? 'conflict' : 'ok',
          entity: toPlayer(stored),
        }
      }
      const tombstoneOnly = stored !== null && write.deletedAt !== null
      const data = {
        updatedAt: write.updatedAt,
        deletedAt: write.deletedAt,
        ...(tombstoneOnly
          ? {}
          : {
              name: write.name,
              color: write.color,
              shape: toPlayerShapeRecord(write.shape),
              handle: write.handle,
              isCurrentUser: write.deletedAt ? false : write.isCurrentUser,
            }),
      }
      const record = stored
        ? await this.txHost.tx.player.update({
            where: { id: write.id },
            data,
          })
        : await this.txHost.tx.player.create({
            data: {
              id: write.id,
              userId,
              name: write.name,
              color: write.color,
              shape: toPlayerShapeRecord(write.shape),
              handle: write.handle,
              isCurrentUser: write.deletedAt ? false : write.isCurrentUser,
              createdAt: write.createdAt,
              updatedAt: write.updatedAt,
              deletedAt: write.deletedAt,
            },
          })
      return { status: 'ok', entity: toPlayer(record) }
    } catch (error) {
      if (error instanceof ConflictError) throw error
      rethrowPrismaError(error, {
        conflict: ErrorCode.CURRENT_PLAYER_ALREADY_EXISTS,
      })
    }
  }

  /** Live player of the user; throws PLAYER_NOT_FOUND otherwise. */
  async findById(userId: string, id: string): Promise<Player> {
    const record = await this.txHost.tx.player.findFirst({
      where: { id, userId, deletedAt: null },
    })
    if (!record) {
      throw new NotFoundError('Player not found', {
        code: ErrorCode.PLAYER_NOT_FOUND,
        details: { playerId: id },
      })
    }
    return toPlayer(record)
  }

  /**
   * Players of the user. Without `updatedSince` only live players are returned;
   * with it, everything modified after that date, tombstones included.
   */
  async listByUser(userId: string, updatedSince?: Date): Promise<Player[]> {
    const records = await this.txHost.tx.player.findMany({
      where: updatedSince
        ? { userId, updatedAt: { gt: updatedSince } }
        : { userId, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
    return records.map(toPlayer)
  }

  /** Ids, among `ids`, of the user's live players. */
  async findLiveIds(userId: string, ids: string[]): Promise<Set<string>> {
    const records = await this.txHost.tx.player.findMany({
      where: { userId, deletedAt: null, id: { in: ids } },
      select: { id: true },
    })
    return new Set(records.map((record) => record.id))
  }

  /**
   * Ids, among `ids`, of players owned by the user, deleted ones included: a
   * play may reference a player deleted afterwards (it keeps a snapshot).
   */
  async findOwnedIds(userId: string, ids: string[]): Promise<Set<string>> {
    const records = await this.txHost.tx.player.findMany({
      where: { userId, id: { in: ids } },
      select: { id: true },
    })
    return new Set(records.map((record) => record.id))
  }

  /** Changes (tombstones included) after a revision, oldest first. */
  async listChangedSince(
    userId: string,
    revision: number,
    take: number,
  ): Promise<Player[]> {
    const records = await this.txHost.tx.player.findMany({
      where: { userId, revision: { gt: revision } },
      orderBy: { revision: 'asc' },
      take,
    })
    return records.map(toPlayer)
  }

  /** Idempotent soft delete; plays keep their snapshot of the player. */
  async softDelete(userId: string, id: string, at: Date): Promise<void> {
    await this.txHost.tx.player.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: at, updatedAt: at, isCurrentUser: false },
    })
  }
}
