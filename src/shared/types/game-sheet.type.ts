/** `null` = l'entrée s'applique à toutes les configurations de joueurs. */
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

/** Fiche de règles générée pour un jeu, dans une langue. */
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
    readonly endOfGame: {
      triggers: GameSheetEntry[]
      timing: string
      scoring: GameSheetScoringEntry[]
      winner: GameSheetEntry[]
    },
    readonly confidence: SheetConfidence,
    readonly sources: GameSheetSource[],
    readonly warnings: string[],
    /** Modèle d'IA ayant produit la fiche. */
    readonly generatedBy: string,
    readonly generatedAt: Date,
  ) {}
}

/** État d'agrégation de la fiche d'un jeu, toutes langues confondues. */
export type GameSheetStatus = {
  /** Une génération réussie a été enregistrée (`game_aggregation_runs`). */
  generated: boolean
  /** Langues dans lesquelles la fiche est disponible, la langue de génération en premier. */
  supportedLanguages: string[]
}
