import { Injectable } from '@nestjs/common'
import { TransactionHost } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import { ConflictError, ErrorCode, NotFoundError } from '@/shared/errors'
import type { Group, GroupWrite, LwwResult } from '@/shared/types'
import { resolveLastWriteWins } from '@/utils/last-write-wins'
import { type GroupWithMembersRecord, toGroup } from '../mappers'
import type { PrismaService } from '../prisma.service'
import { rethrowPrismaError } from '../prisma-errors'

const MEMBERS_INCLUDE = {
  members: { select: { playerId: true }, orderBy: { position: 'asc' } },
} as const

@Injectable()
export class GroupRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {}

  /**
   * Last-write-wins upsert of a client-identified group (see
   * `PlayerRepository.upsertLww`). Members are replaced as a whole.
   */
  async upsertLww(
    userId: string,
    write: GroupWrite,
  ): Promise<LwwResult<Group>> {
    try {
      const stored = await this.txHost.tx.group.findUnique({
        where: { id: write.id },
        include: MEMBERS_INCLUDE,
      })
      if (stored && stored.userId !== userId) {
        throw new ConflictError('Group id already used', {
          code: ErrorCode.CONFLICT,
          details: { groupId: write.id },
        })
      }
      const decision = resolveLastWriteWins(
        write.updatedAt,
        stored?.updatedAt ?? null,
      )
      if (stored && decision !== 'apply') {
        return {
          status: decision === 'conflict' ? 'conflict' : 'ok',
          entity: await this.withMatchCount(userId, stored),
        }
      }
      const tombstoneOnly = stored !== null && write.deletedAt !== null
      if (stored && !tombstoneOnly) {
        await this.txHost.tx.groupMember.deleteMany({
          where: { groupId: write.id },
        })
      }
      const members = {
        create: write.memberIds.map((playerId, position) => ({
          playerId,
          position,
        })),
      }
      const record = stored
        ? await this.txHost.tx.group.update({
            where: { id: write.id },
            data: {
              updatedAt: write.updatedAt,
              deletedAt: write.deletedAt,
              ...(tombstoneOnly ? {} : { name: write.name, members }),
            },
            include: MEMBERS_INCLUDE,
          })
        : await this.txHost.tx.group.create({
            data: {
              id: write.id,
              userId,
              name: write.name,
              createdAt: write.createdAt,
              updatedAt: write.updatedAt,
              deletedAt: write.deletedAt,
              members,
            },
            include: MEMBERS_INCLUDE,
          })
      return { status: 'ok', entity: await this.withMatchCount(userId, record) }
    } catch (error) {
      if (error instanceof ConflictError) throw error
      rethrowPrismaError(error, { notFound: ErrorCode.GROUP_NOT_FOUND })
    }
  }

  /** Live group of the user; throws GROUP_NOT_FOUND otherwise. */
  async findById(userId: string, id: string): Promise<Group> {
    const record = await this.txHost.tx.group.findFirst({
      where: { id, userId, deletedAt: null },
      include: MEMBERS_INCLUDE,
    })
    if (!record) {
      throw new NotFoundError('Group not found', {
        code: ErrorCode.GROUP_NOT_FOUND,
        details: { groupId: id },
      })
    }
    return this.withMatchCount(userId, record)
  }

  /**
   * Groups of the user. Without `updatedSince` only live groups are returned;
   * with it, everything modified after that date, tombstones included.
   */
  async listByUser(userId: string, updatedSince?: Date): Promise<Group[]> {
    const records = await this.txHost.tx.group.findMany({
      where: updatedSince
        ? { userId, updatedAt: { gt: updatedSince } }
        : { userId, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: MEMBERS_INCLUDE,
    })
    return Promise.all(
      records.map((record) => this.withMatchCount(userId, record)),
    )
  }

  /** Changes (tombstones included) after a revision, oldest first. */
  async listChangedSince(
    userId: string,
    revision: number,
    take: number,
  ): Promise<Group[]> {
    const records = await this.txHost.tx.group.findMany({
      where: { userId, revision: { gt: revision } },
      orderBy: { revision: 'asc' },
      take,
      include: MEMBERS_INCLUDE,
    })
    return Promise.all(
      records.map((record) => this.withMatchCount(userId, record)),
    )
  }

  /** Idempotent soft delete. */
  async softDelete(userId: string, id: string, at: Date): Promise<void> {
    await this.txHost.tx.group.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: at, updatedAt: at },
    })
  }

  /** Number of the user's live plays that include at least one member. */
  private async withMatchCount(
    userId: string,
    record: GroupWithMembersRecord,
  ): Promise<Group> {
    const memberIds = record.members.map((member) => member.playerId)
    const matchCount =
      memberIds.length === 0
        ? 0
        : await this.txHost.tx.play.count({
            where: {
              userId,
              deletedAt: null,
              players: { some: { playerId: { in: memberIds } } },
            },
          })
    return toGroup(record, matchCount)
  }
}
