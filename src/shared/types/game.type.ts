/** Catalog game (data useful for identification). */
export class Game {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly year: number | null,
    readonly publisher: string | null,
    readonly edition: string | null,
    readonly bggId: number | null,
    /** Official rulebook found during a previous generation. */
    readonly ruleBookUrl: string | null = null,
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

/** Result of a game search by name (autocomplete). */
export type GameSearchResult = {
  id: string
  /** Name in the requested language if known, otherwise canonical name. */
  name: string
  year: number | null
  categories: GameCategory[]
  /** Box cover image URL, null when unknown. */
  imageUrl: string | null
}
