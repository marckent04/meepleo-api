import type { GameSearchResult } from './game.type'

/** Game favorited by a user. */
export type FavoriteEntry = GameSearchResult & {
  /** Date added to favorites. */
  addedAt: Date
}
