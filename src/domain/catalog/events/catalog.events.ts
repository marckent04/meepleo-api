/** A game was added to a user's catalog (or was already in it). */
export class GameAddedToCatalogEvent {
  constructor(
    readonly userId: string,
    readonly gameId: string,
    /** ISO 639-1 code of the user's language. */
    readonly language: string,
  ) {}
}
