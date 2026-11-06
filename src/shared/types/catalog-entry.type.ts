import type { GameSearchResult } from './game.type'

/** Jeu du catalogue personnel d'un utilisateur. */
export type CatalogEntry = GameSearchResult & {
  /** Date d'ajout au catalogue. */
  addedAt: Date
}
