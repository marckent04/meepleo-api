import {
  Game,
  type GameCategory,
  type GameSearchResult,
  type IdentifiedGame,
} from '@/shared/types'
import type {
  GameCategory as GameCategoryRecord,
  Game as GameRecord,
  Prisma,
} from '../generated/prisma/client'
import { localized } from './localized-text.mapper'

export function toGame(record: GameRecord): Game {
  return new Game(
    record.id,
    record.name,
    record.year,
    record.publisher,
    record.edition,
    record.bggId,
    record.ruleBookUrl,
    {
      minPlayers: record.minPlayers,
      maxPlayers: record.maxPlayers,
      minAge: record.minAge,
      minDuration: record.minDuration,
      maxDuration: record.maxDuration,
      hasImage: record.imageUrl !== null,
    },
  )
}

function toGameCategory(category: GameCategoryRecord): GameCategory {
  return category.toLowerCase() as GameCategory
}

function toGameCategoryRecord(category: GameCategory): GameCategoryRecord {
  return category.toUpperCase() as GameCategoryRecord
}

/** Raw row of `GameRepository.search`. */
export type GameSearchRow = {
  id: string
  name: string
  localized_name: string | null
  year: number | null
  categories: GameCategoryRecord[]
  image_url: string | null
}

export function toGameSearchResult(row: GameSearchRow): GameSearchResult {
  return {
    id: row.id,
    name: row.localized_name || row.name,
    year: row.year,
    categories: row.categories.map(toGameCategory),
    imageUrl: row.image_url,
  }
}

/** Columns needed to build a GameSearchResult through Prisma. */
export const GAME_SEARCH_RESULT_SELECT = {
  id: true,
  name: true,
  localizedNames: true,
  year: true,
  categories: true,
  imageUrl: true,
} satisfies Prisma.GameSelect

export type GameSearchResultRecord = Prisma.GameGetPayload<{
  select: typeof GAME_SEARCH_RESULT_SELECT
}>

/** Name in `language` when known, otherwise canonical name. */
export function toGameSearchResultFromRecord(
  record: GameSearchResultRecord,
  language: string,
): GameSearchResult {
  return {
    id: record.id,
    name: localized(record.localizedNames, language) || record.name,
    year: record.year,
    categories: record.categories.map(toGameCategory),
    imageUrl: record.imageUrl,
  }
}

/** New catalog game created from a barcode lookup (no sheet yet). */
export function toIdentifiedGameCreateData(
  game: IdentifiedGame,
): Prisma.GameCreateManyInput {
  return {
    bggId: game.bggId,
    name: game.name,
    year: game.year,
    categories: game.categories.map(toGameCategoryRecord),
  }
}
