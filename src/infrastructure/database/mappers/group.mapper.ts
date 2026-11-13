import type { Group } from '@/shared/types'
import type { Group as GroupRecord } from '../generated/prisma/client'

/** Group record with its members in display order. */
export type GroupWithMembersRecord = GroupRecord & {
  members: { playerId: string }[]
}

export function toGroup(
  record: GroupWithMembersRecord,
  matchCount: number,
): Group {
  return {
    id: record.id,
    name: record.name,
    memberIds: record.members.map((member) => member.playerId),
    matchCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt,
    revision: Number(record.revision),
  }
}
