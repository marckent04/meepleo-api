/** Jeu du catalogue (données utiles à l'identification). */
export class Game {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly year: number | null,
    readonly publisher: string | null,
    readonly edition: string | null,
    readonly bggId: number | null,
  ) {}
}

export const GAME_CATEGORIES = [
  'abstract',
  'card',
  'children',
  'family',
  'party',
  'strategy',
  'thematic',
  'war',
] as const
export type GameCategory = (typeof GAME_CATEGORIES)[number]

/** Résultat d'une recherche de jeu par nom (autocomplétion). */
export type GameSearchResult = {
  id: string
  /** Nom dans la langue demandée s'il est connu, sinon nom canonique. */
  name: string
  year: number | null
  categories: GameCategory[]
}
