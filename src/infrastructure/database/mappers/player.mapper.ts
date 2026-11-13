import type { Player, PlayerShape } from '@/shared/types'
import type {
  Player as PlayerRecord,
  PlayerShape as PlayerShapeRecord,
} from '../generated/prisma/client'

export function toPlayerShape(record: PlayerShapeRecord): PlayerShape {
  return record.toLowerCase() as PlayerShape
}

export function toPlayerShapeRecord(shape: PlayerShape): PlayerShapeRecord {
  return shape.toUpperCase() as PlayerShapeRecord
}

export function toPlayer(record: PlayerRecord): Player {
  return {
    id: record.id,
    name: record.name,
    color: record.color,
    shape: toPlayerShape(record.shape),
    handle: record.handle,
    isCurrentUser: record.isCurrentUser,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt,
    revision: Number(record.revision),
  }
}
