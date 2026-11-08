import type { GameCategory } from './game.type'

/** Game identified by an external barcode lookup. */
export type IdentifiedGame = {
  /** BoardGameGeek identifier, used to match our catalog. */
  bggId: number
  /** Canonical (BGG) name. */
  name: string
  /** Title published in the requested language; null when the provider has none. */
  localizedName: string | null
  year: number | null
  /** May be empty for providers that do not classify games. */
  categories: GameCategory[]
}

/**
 * External source resolving an EAN / UPC to board games. Port implemented by an
 * infrastructure adapter: the domain never depends on a given provider. Also
 * used as the Nest injection token.
 */
export abstract class GameBarcodeLookup {
  /**
   * Games sold under `code`, with their title in `language` when known. Empty
   * array when the barcode is unknown; throws when the lookup itself fails.
   */
  abstract findByBarcode(
    code: string,
    language: string,
  ): Promise<IdentifiedGame[]>
}
