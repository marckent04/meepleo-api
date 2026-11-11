/** Catalog data already known (BGG seed, previous generation): not looked for again. */
export type GameKnownDetails = {
  minPlayers: number | null
  maxPlayers: number | null
  minAge: number | null
  minDuration: number | null
  maxDuration: number | null
  /** A box cover image URL is stored. */
  hasImage: boolean
}

export const EMPTY_KNOWN_DETAILS: GameKnownDetails = {
  minPlayers: null,
  maxPlayers: null,
  minAge: null,
  minDuration: null,
  maxDuration: null,
  hasImage: false,
}

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
    readonly known: GameKnownDetails = EMPTY_KNOWN_DETAILS,
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

/** Game whose sheet exists but whose score sheet template was never derived. */
export type GameWithoutScoringTemplate = {
  id: string
  name: string
  bggId: number | null
  /** Language the sheet was generated in (first supported language). */
  language: string
}
