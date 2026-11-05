import { Game } from '@/shared/types'
import type { Game as GameRecord } from '../generated/prisma/client'

export function toGame(record: GameRecord): Game {
  return new Game(
    record.id,
    record.name,
    record.year,
    record.publisher,
    record.edition,
    record.bggId,
  )
}
