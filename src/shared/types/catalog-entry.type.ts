import type { GameSearchResult } from './game.type'

/** Game in a user's personal list (library or wishlist). */
export type CatalogEntry = GameSearchResult & {
  /** Date added to the list. */
  addedAt: Date
  /** Last modification date, set by the client (last write wins). */
  updatedAt: Date
  /** Tombstone date when the game was removed from the list. */
  deletedAt: Date | null
  /** Server-side change counter, cursor of `sync/pull`. */
  revision: number
}
