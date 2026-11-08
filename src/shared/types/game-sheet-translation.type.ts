/** Translation of a stored rule (`GameRule.id`). `title` is null if the rule has no title. */
export type GameSheetRuleTranslation = {
  id: string
  title: string | null
  text: string
}

/** Translation, in `language`, of the texts of an existing sheet in `sourceLanguage`. */
export class GameSheetTranslation {
  constructor(
    readonly gameId: string,
    readonly sourceLanguage: string,
    readonly language: string,
    readonly localizedName: string,
    readonly description: string,
    readonly turnSummary: string,
    readonly endTiming: string,
    /** Same order and same count as the source sheet's warnings. */
    readonly warnings: string[],
    readonly rules: GameSheetRuleTranslation[],
  ) {}
}
