import type { CatalogEntry } from './catalog-entry.type'

/** Game favorited by a user. */
export type FavoriteEntry = CatalogEntry

/** Write of a game in a list (library, wishlist or favorites) coming from a client. */
export type GameListWrite = {
  gameId: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}
