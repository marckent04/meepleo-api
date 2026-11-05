/** Traduction d'une règle stockée (`GameRule.id`). `title` est null si la règle n'a pas de titre. */
export type GameSheetRuleTranslation = {
  id: string
  title: string | null
  text: string
}

/** Traduction, dans `language`, des textes d'une fiche existante en `sourceLanguage`. */
export class GameSheetTranslation {
  constructor(
    readonly gameId: string,
    readonly sourceLanguage: string,
    readonly language: string,
    readonly localizedName: string,
    readonly description: string,
    readonly turnSummary: string,
    readonly endTiming: string,
    /** Même ordre et même nombre que les avertissements de la fiche source. */
    readonly warnings: string[],
    readonly rules: GameSheetRuleTranslation[],
  ) {}
}
