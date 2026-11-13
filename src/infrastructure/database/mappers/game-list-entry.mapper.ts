import type { CatalogEntry, GameCategory } from '@/shared/types'
import type { Prisma } from '../generated/prisma/client'

/** Columns of a list row (library, wishlist, favorites) with its game. */
export const GAME_LIST_ENTRY_SELECT = {
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  revision: true,
  game: {
    select: {
      id: true,
      name: true,
      localizedNames: true,
      year: true,
      categories: true,
      imageUrl: true,
    },
  },
} satisfies Prisma.UserGameSelect & Prisma.UserFavoriteSelect

export type GameListEntryRecord = Prisma.UserGameGetPayload<{
  select: typeof GAME_LIST_ENTRY_SELECT
}>

/** Name in `language` when known, otherwise the canonical name. */
export function toGameListEntry(
  record: GameListEntryRecord,
  language: string,
): CatalogEntry {
  const { game } = record
  const localizedNames = game.localizedNames as Record<string, string> | null
  return {
    id: game.id,
    name: localizedNames?.[language] || game.name,
    year: game.year,
    imageUrl: game.imageUrl,
    categories: game.categories.map(
      (category) => category.toLowerCase() as GameCategory,
    ),
    addedAt: record.createdAt,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt,
    revision: Number(record.revision),
  }
}
