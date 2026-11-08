/** `null` = the entry applies to all player configurations. */
export type PlayerCounts = number[] | null

export type SheetConfidence = 'low' | 'medium' | 'high'

export type GameSheetEntry = {
  id: string
  playerCounts: PlayerCounts
  text: string
}

export type GameSheetOrderedEntry = GameSheetEntry & { order: number }

export type GameSheetTitledEntry = GameSheetEntry & { title: string }

export type GameSheetTurnStep = GameSheetOrderedEntry & {
  optional: boolean
  title: string
}

export type GameSheetScoringEntry = GameSheetOrderedEntry & { title: string }

export type GameSheetSource = { title: string; url: string }

/** Rule sheet generated for a game, in a language. */
export class GameSheet {
  constructor(
    readonly gameId: string,
    readonly language: string,
    readonly game: {
      localizedName: string
      edition: string | null
      publisher: string | null
      ruleBookUrl: string | null
    },
    readonly players: {
      min: number | null
      max: number | null
      recommended: number[]
    },
    readonly minAge: number | null,
    readonly durationMinutes: { min: number | null; max: number | null },
    readonly description: string,
    readonly setup: GameSheetOrderedEntry[],
    readonly turn: { summary: string; steps: GameSheetTurnStep[] },
    readonly specialRules: GameSheetTitledEntry[],
    readonly variants: GameSheetTitledEntry[],
    readonly endOfGame: {
      triggers: GameSheetEntry[]
      timing: string
      scoring: GameSheetScoringEntry[]
      winner: GameSheetEntry[]
    },
    readonly confidence: SheetConfidence,
    readonly sources: GameSheetSource[],
    readonly warnings: string[],
    /** AI model that produced the sheet. */
    readonly generatedBy: string,
    readonly generatedAt: Date,
  ) {}
}

/** Aggregation state of a game's sheet, all languages combined. */
export type GameSheetStatus = {
  /** A successful generation was recorded (`game_aggregation_runs`). */
  generated: boolean
  /** Languages the sheet is available in, the generation language first. */
  supportedLanguages: string[]
}
