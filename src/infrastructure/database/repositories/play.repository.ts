import { Injectable } from '@nestjs/common'
import { TransactionHost } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import { ErrorCode, NotFoundError } from '@/shared/errors'
import type {
  NewPlay,
  Play,
  PlayScore,
  PlaySideResult,
  PlaySummary,
} from '@/shared/types'
import {
  PLAY_INCLUDE,
  PLAY_SUMMARY_INCLUDE,
  toPlay,
  toPlayStatusRecord,
  toPlaySummary,
  toScoringTemplateJson,
} from '../mappers'
import type { PrismaService } from '../prisma.service'
import { rethrowPrismaError } from '../prisma-errors'

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
          userId: play.userId,
          gameId: play.gameId,
          playedAt: play.playedAt,
          note: play.note,
          scoring: toScoringTemplateJson(play.scoring),
          players: {
            create: play.players.map((player, position) => ({
              ...player,
              position,
            })),
          },
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

  /** User's plays, most recently played first, optionally of a single game. */
  async listByUser(
    userId: string,
    language: string,
    { gameId, limit }: { gameId: string | null; limit: number },
  ): Promise<PlaySummary[]> {
    const records = await this.txHost.tx.play.findMany({
      where: {
        userId,
        deletedAt: null,
        game: { deletedAt: null },
        ...(gameId ? { gameId } : {}),
      },
      orderBy: [{ playedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: PLAY_SUMMARY_INCLUDE,
    })
    return records.map((record) => toPlaySummary(record, language))
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
      await this.txHost.tx.play.update({ where: { id }, data: details })
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
        data: { status: toPlayStatusRecord('completed'), completedAt },
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
        data: { status: toPlayStatusRecord('in_progress'), completedAt: null },
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
      data: { deletedAt: new Date() },
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
