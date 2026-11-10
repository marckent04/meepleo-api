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

/** Game identification common to generated and stored sheets. */
type BaseGameSheetGame = {
  edition: string | null
  publisher: string | null
  ruleBookUrl: string | null
}

/** Game identification produced by the generation. */
export type GeneratedGameSheetGame = BaseGameSheetGame & {
  /** Confirmed title per supported language (ISO 639-1 code -> title). */
  localizedNames: Record<string, string>
}

/** Game identification of a stored sheet, read in a language. */
export type GameSheetGame = BaseGameSheetGame & {
  /** Name displayed in the sheet language: its title, or the catalog name. */
  localizedName: string
}

/**
 * Rule sheet of a game, in a language. Read from the database by default;
 * see `GeneratedGameSheet` for the output of the generation.
 */
export class GameSheet<TGame extends BaseGameSheetGame = GameSheetGame> {
  constructor(
    readonly gameId: string,
    readonly language: string,
    readonly game: TGame,
    readonly players: {
      min: number | null
      max: number | null
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

/** Sheet produced by the generation: no name in the sheet language. */
export type GeneratedGameSheet = GameSheet<GeneratedGameSheetGame>

/** Aggregation state of a game's sheet, all languages combined. */
export type GameSheetStatus = {
  /** A successful generation was recorded (`game_aggregation_runs`). */
  generated: boolean
  /** Languages the sheet is available in, the generation language first. */
  supportedLanguages: string[]
}
