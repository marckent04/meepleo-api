import { Injectable } from '@nestjs/common'
import { TransactionHost } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import { ConflictError, ErrorCode, NotFoundError } from '@/shared/errors'
import type {
  LwwResult,
  NewPlay,
  Play,
  PlayPlayer,
  PlayScore,
  PlaySideResult,
  PlayStatus,
  PlaySummary,
  PlayWrite,
} from '@/shared/types'
import { resolveLastWriteWins } from '@/utils/last-write-wins'
import {
  PLAY_INCLUDE,
  PLAY_SUMMARY_INCLUDE,
  toPlay,
  toPlayerShapeRecord,
  toPlayStatusRecord,
  toPlaySummary,
  toScoringTemplateJson,
} from '../mappers'
import type { PrismaService } from '../prisma.service'
import { rethrowPrismaError } from '../prisma-errors'

/** Players of a play as nested Prisma create inputs, in display order. */
function toPlayerCreates(players: Omit<PlayPlayer, 'id'>[]) {
  return players.map(({ shape, ...player }, position) => ({
    ...player,
    shape: shape ? toPlayerShapeRecord(shape) : null,
    position,
  }))
}

function playNotFound(id: string): NotFoundError {
  return new NotFoundError('Play not found', {
    code: ErrorCode.PLAY_NOT_FOUND,
    details: { playId: id },
  })
}

/**
 * Plays of a user. Reads only see the user's own non-deleted plays of
 * non-deleted games: another user's play is reported as not found.
 */
@Injectable()
export class PlayRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {}

  /** Game named in `language` when known. */
  async create(play: NewPlay, language: string): Promise<Play> {
    try {
      const record = await this.txHost.tx.play.create({
        data: {
          ...(play.id ? { id: play.id } : {}),
          userId: play.userId,
          gameId: play.gameId,
          playedAt: play.playedAt,
          note: play.note,
          scoring: toScoringTemplateJson(play.scoring),
          players: { create: toPlayerCreates(play.players) },
        },
        include: PLAY_INCLUDE,
      })
      return toPlay(record, language)
    } catch (error) {
      rethrowPrismaError(error)
    }
  }

  /** Throws NotFoundError (PLAY_NOT_FOUND) unless the user owns the play. */
  async findById(id: string, userId: string, language: string): Promise<Play> {
    const record = await this.txHost.tx.play.findFirst({
      where: { id, userId, deletedAt: null, game: { deletedAt: null } },
      include: PLAY_INCLUDE,
    })
    if (!record) throw playNotFound(id)
    return toPlay(record, language)
  }

  /**
   * User's plays, most recently played first, optionally filtered. Without
   * `updatedSince` only live plays are returned; with it, everything modified
   * after that date, tombstones included.
   */
  async listByUser(
    userId: string,
    language: string,
    {
      gameId,
      status,
      updatedSince,
      limit,
      offset,
    }: {
      gameId: string | null
      status: PlayStatus | null
      updatedSince: Date | null
      limit: number
      offset: number
    },
  ): Promise<PlaySummary[]> {
    const records = await this.txHost.tx.play.findMany({
      where: {
        userId,
        game: { deletedAt: null },
        ...(updatedSince
          ? { updatedAt: { gt: updatedSince } }
          : { deletedAt: null }),
        ...(gameId ? { gameId } : {}),
        ...(status ? { status: toPlayStatusRecord(status) } : {}),
      },
      orderBy: [{ playedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      skip: offset,
      include: PLAY_SUMMARY_INCLUDE,
    })
    return records.map((record) => toPlaySummary(record, language))
  }

  /** Changes (tombstones included) after a revision, oldest first. */
  async listChangedSince(
    userId: string,
    language: string,
    revision: number,
    take: number,
  ): Promise<Play[]> {
    const records = await this.txHost.tx.play.findMany({
      where: { userId, revision: { gt: revision } },
      orderBy: { revision: 'asc' },
      take,
      include: PLAY_INCLUDE,
    })
    return records.map((record) => toPlay(record, language))
  }

  /**
   * Last-write-wins upsert of a whole play (offline-first): replaces players
   * and scores atomically. Returns a null entity for a tombstone of an unknown
   * play (nothing to delete). An id owned by another user is a conflict (409).
   * To call in a transaction.
   */
  async upsertLww(
    userId: string,
    write:
      | PlayWrite
      | (Pick<PlayWrite, 'id' | 'updatedAt'> & { deletedAt: Date }),
    language: string,
  ): Promise<LwwResult<Play | null>> {
    try {
      const stored = await this.txHost.tx.play.findUnique({
        where: { id: write.id },
        include: PLAY_INCLUDE,
      })
      if (stored && stored.userId !== userId) {
        throw new ConflictError('Play id already used', {
          code: ErrorCode.CONFLICT,
          details: { playId: write.id },
        })
      }
      const decision = resolveLastWriteWins(
        write.updatedAt,
        stored?.updatedAt ?? null,
      )
      if (stored && decision !== 'apply') {
        return {
          status: decision === 'conflict' ? 'conflict' : 'ok',
          entity: toPlay(stored, language),
        }
      }
      if (write.deletedAt !== null && !('gameId' in write)) {
        if (!stored) return { status: 'ok', entity: null }
        await this.txHost.tx.play.update({
          where: { id: write.id },
          data: { deletedAt: write.deletedAt, updatedAt: write.updatedAt },
        })
        return { status: 'ok', entity: await this.refetch(write.id, language) }
      }
      if (!('gameId' in write)) {
        // Tombstone fields only, but `deletedAt` null: nothing to apply.
        return { status: 'ok', entity: null }
      }
      const data = {
        gameId: write.gameId,
        status: toPlayStatusRecord(write.status),
        playedAt: write.playedAt,
        startedAt: write.startedAt,
        endedAt: write.endedAt,
        completedAt: write.completedAt,
        durationSeconds: write.durationSeconds,
        firstPlayerId: write.firstPlayerId,
        note: write.note,
        scoring: toScoringTemplateJson(write.scoring),
        updatedAt: write.updatedAt,
        deletedAt: write.deletedAt,
      }
      if (stored) {
        await this.txHost.tx.playScore.deleteMany({
          where: { playId: write.id },
        })
        await this.txHost.tx.playPlayer.deleteMany({
          where: { playId: write.id },
        })
        await this.txHost.tx.play.update({ where: { id: write.id }, data })
        await this.txHost.tx.playPlayer.createMany({
          data: toPlayerCreates(write.players).map((player) => ({
            ...player,
            playId: write.id,
          })),
        })
      } else {
        await this.txHost.tx.play.create({
          data: {
            ...data,
            id: write.id,
            userId,
            createdAt: write.createdAt,
            players: { create: toPlayerCreates(write.players) },
          },
        })
      }
      await this.txHost.tx.playScore.createMany({
        data: write.scores.map((score) => ({ ...score, playId: write.id })),
      })
      return { status: 'ok', entity: await this.refetch(write.id, language) }
    } catch (error) {
      if (error instanceof ConflictError) throw error
      rethrowPrismaError(error, { notFound: ErrorCode.PLAY_NOT_FOUND })
    }
  }

  /** Reads back a play even when deleted (the revision was just bumped). */
  private async refetch(id: string, language: string): Promise<Play> {
    const record = await this.txHost.tx.play.findUniqueOrThrow({
      where: { id },
      include: PLAY_INCLUDE,
    })
    return toPlay(record, language)
  }

  /**
   * Replaces the whole score sheet and the totals and ranks of the players.
   * To call in a transaction.
   */
  async replaceScores(
    id: string,
    scores: PlayScore[],
    results: PlaySideResult[],
  ): Promise<void> {
    try {
      await this.txHost.tx.playScore.deleteMany({ where: { playId: id } })
      await this.txHost.tx.playScore.createMany({
        data: scores.map((score) => ({ ...score, playId: id })),
      })
      await this.txHost.tx.play.update({
        where: { id },
        data: { updatedAt: new Date() },
      })
      await this.updateSideResults(id, results)
    } catch (error) {
      rethrowPrismaError(error)
    }
  }

  async updateDetails(
    id: string,
    details: { playedAt?: Date; note?: string | null },
  ): Promise<void> {
    try {
      await this.txHost.tx.play.update({
        where: { id },
        data: { ...details, updatedAt: new Date() },
      })
    } catch (error) {
      rethrowPrismaError(error, { notFound: ErrorCode.PLAY_NOT_FOUND })
    }
  }

  /** Marks the play completed and its winners. To call in a transaction. */
  async complete(
    id: string,
    completedAt: Date,
    winnerSides: number[],
  ): Promise<void> {
    try {
      await this.txHost.tx.play.update({
        where: { id },
        data: {
          status: toPlayStatusRecord('completed'),
          completedAt,
          updatedAt: new Date(),
        },
      })
      await this.setWinners(id, winnerSides)
    } catch (error) {
      rethrowPrismaError(error, { notFound: ErrorCode.PLAY_NOT_FOUND })
    }
  }

  /** Back in progress, without winners. To call in a transaction. */
  async reopen(id: string): Promise<void> {
    try {
      await this.txHost.tx.play.update({
        where: { id },
        data: {
          status: toPlayStatusRecord('in_progress'),
          completedAt: null,
          updatedAt: new Date(),
        },
      })
      await this.setWinners(id, [])
    } catch (error) {
      rethrowPrismaError(error, { notFound: ErrorCode.PLAY_NOT_FOUND })
    }
  }

  /** Idempotent: a missing or already deleted play is ignored. */
  async softDelete(id: string, userId: string): Promise<void> {
    await this.txHost.tx.play.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: new Date(), updatedAt: new Date() },
    })
  }

  private async updateSideResults(
    id: string,
    results: PlaySideResult[],
  ): Promise<void> {
    for (const { side, total, rank } of results) {
      await this.txHost.tx.playPlayer.updateMany({
        where: { playId: id, side },
        data: { total, rank },
      })
    }
  }

  private async setWinners(id: string, winnerSides: number[]): Promise<void> {
    await this.txHost.tx.playPlayer.updateMany({
      where: { playId: id, side: { notIn: winnerSides } },
      data: { isWinner: false },
    })
    if (winnerSides.length === 0) return
    await this.txHost.tx.playPlayer.updateMany({
      where: { playId: id, side: { in: winnerSides } },
      data: { isWinner: true },
    })
  }
}
