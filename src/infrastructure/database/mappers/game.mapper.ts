import { Game, type GameCategory, type GameSearchResult } from '@/shared/types'
import type {
  GameCategory as GameCategoryRecord,
  Game as GameRecord,
} from '../generated/prisma/client'

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

/** Ligne brute de `GameRepository.search`. */
export type GameSearchRow = {
  id: string
  name: string
  localized_name: string | null
  year: number | null
  categories: GameCategoryRecord[]
}

export function toGameSearchResult(row: GameSearchRow): GameSearchResult {
  return {
    id: row.id,
    name: row.localized_name || row.name,
    year: row.year,
    categories: row.categories.map(
      (category) => category.toLowerCase() as GameCategory,
    ),
  }
}
