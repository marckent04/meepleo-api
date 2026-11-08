import type { GameSearchResult } from './game.type'

/** Game in a user's personal catalog. */
export type CatalogEntry = GameSearchResult & {
  /** Date added to the catalog. */
  addedAt: Date
}
